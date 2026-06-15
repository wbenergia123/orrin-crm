# Multi-Tenant com Subdomínios — Orrin CRM

**Data:** 2026-06-15  
**Status:** Aprovado  
**Arquitetura:** Schema único + RLS + Supabase Auth + Vercel wildcard  

---

## Decisões Finais

| Camada | Decisão |
|--------|---------|
| Isolamento | Abordagem 2: tenant_id em todas as tabelas + RLS |
| Subdomínios | Modelo 2: `empresa.orrin.com` via Vercel wildcard |
| Auth | Supabase Auth + Custom Token Hook (injeta `tenant_id` e `role`) |
| Criação de tenant | Manual por super admin via `admin.orrin.com` |
| Slug | Admin define na criação, validado com regex + lista de reservados |
| Infra | Vercel + Cloudflare (SSL automático, 2 entradas DNS) |
| Custo | ~$30/mês fixo para qualquer número de tenants |

---

## Seção 1: Database

### Nova tabela: `organizacoes`

```sql
CREATE TABLE organizacoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       CITEXT UNIQUE NOT NULL,  -- case-insensitive, vira URL
  nome       VARCHAR(255) NOT NULL,
  ativo      BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMP,               -- soft delete
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index para busca por slug (frequente)
CREATE INDEX idx_organizacoes_slug ON organizacoes(slug) WHERE deleted_at IS NULL;
```

### tenant_id em todas as tabelas

```sql
ALTER TABLE usuarios      ADD COLUMN tenant_id UUID REFERENCES organizacoes(id);
ALTER TABLE clientes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE reunioes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE conversas     ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE configuracoes ADD COLUMN tenant_id UUID UNIQUE NOT NULL REFERENCES organizacoes(id);

-- Unique composto: mesmo telefone pode existir em tenants diferentes
ALTER TABLE clientes DROP CONSTRAINT clientes_telefone_key;
ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_telefone UNIQUE (tenant_id, telefone);
```

### Indexes obrigatórios em tenant_id

```sql
-- Simples
CREATE INDEX idx_clientes_tenant     ON clientes(tenant_id);
CREATE INDEX idx_reunioes_tenant     ON reunioes(tenant_id);
CREATE INDEX idx_conversas_tenant    ON conversas(tenant_id);
CREATE INDEX idx_usuarios_tenant     ON usuarios(tenant_id);

-- Compostos (queries mais comuns)
CREATE INDEX idx_clientes_tenant_telefone ON clientes(tenant_id, telefone);
CREATE INDEX idx_reunioes_tenant_data     ON reunioes(tenant_id, data_hora);
```

### RLS: função + policies

```sql
-- Função que extrai tenant_id do JWT
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID
$$ LANGUAGE sql STABLE;

-- Ativar RLS em todas as tabelas
ALTER TABLE clientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Policy com bypass para super_admin (repetir em cada tabela)
CREATE POLICY "tenant_isolation" ON clientes
  USING (
    tenant_id = auth.tenant_id()
    OR (auth.jwt() ->> 'role') = 'super_admin'
  )
  WITH CHECK (
    tenant_id = auth.tenant_id()
    OR (auth.jwt() ->> 'role') = 'super_admin'
  );
```

### Auth Hook: injeta tenant_id + role no JWT

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims    jsonb;
  user_row  RECORD;
BEGIN
  SELECT tenant_id, role INTO user_row
  FROM public.usuarios WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_row.tenant_id::text));
  claims := jsonb_set(claims, '{role}',      to_jsonb(user_row.role));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql;
-- Ativar em: Authentication → Hooks → Custom Access Token
```

### Trigger: sincroniza auth.users → public.usuarios

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'tenant_id' THEN
    INSERT INTO public.usuarios (id, email, tenant_id, role)
    VALUES (
      NEW.id,
      NEW.email,
      (NEW.raw_user_meta_data->>'tenant_id')::uuid,
      COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Audit log do super admin

```sql
CREATE TABLE admin_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES usuarios(id),
  action     VARCHAR(50) NOT NULL,  -- 'create_org', 'deactivate_org', etc
  target_id  UUID,
  metadata   JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Seção 2: Auth

### Fluxo de Login

```
1. Frontend detecta slug do subdomínio
2. Valida org via GET /api/orgs/by-slug/:slug (público)
   → 404 se org não existir, inativa ou deletada
3. Login: supabase.auth.signInWithPassword({ email, password })
4. Auth Hook injeta tenant_id + role no JWT
5. Todas as chamadas API usam Bearer token
```

### Middleware `requireAuth`

```typescript
// backend/src/middleware/auth.ts
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token ausente' })

  const payload = verifySupabaseJWT(token)  // valida assinatura + exp

  // Validar slug do subdomínio === tenant_id do JWT (anti cross-tenant)
  const hostname = req.headers.host
  const slug = hostname.split('.')[0]
  
  if (slug !== 'admin') {
    const org = await getOrgBySlug(slug)
    if (!org || org.id !== payload.tenant_id) {
      return res.status(403).json({ error: 'Token inválido para este domínio' })
    }
  }

  req.user = {
    id:        payload.sub,
    email:     payload.email,
    role:      payload.role,
    tenant_id: payload.tenant_id,
  }
  next()
}
```

### Middleware `requireSuperAdmin`

```typescript
export function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  // Audit log automático para mutações
  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    logAdminAction(req)
  }
  next()
}
```

---

## Seção 3: Frontend

### Detecção de Subdomain (robusta)

```typescript
// frontend/src/lib/tenant.ts
const ROOT_DOMAIN = 'orrin.com'
const RESERVED = ['www', 'admin', 'api', 'app', 'mail', 'blog', 'docs', 'status', 'cdn', 'static', 'help', 'support']

export function getTenantSlug(): string | null {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_DEV_TENANT ?? 'demo'
  }

  const hostname = window.location.hostname
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null

  const slug = hostname.replace(`.${ROOT_DOMAIN}`, '')
  if (RESERVED.includes(slug)) return slug          // 'admin' tratado à parte
  if (!/^[a-z0-9-]+$/.test(slug)) return null

  return slug
}
```

### Supabase Client (storageKey por tenant)

```typescript
// frontend/src/lib/supabase.ts
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
      storageKey: `sb-auth-${getTenantSlug()}`,  // sessão isolada por tenant
    }
  }
)
```

### Roteamento por Subdomain

```typescript
// frontend/src/App.tsx
function App() {
  const slug = getTenantSlug()

  if (slug === null)    return <LandingPage />
  if (slug === 'admin') return <SuperAdminApp />
  return <ClientApp slug={slug} />
}
```

`ClientApp` valida a org antes de renderizar qualquer rota:

```typescript
function ClientApp({ slug }) {
  const { data: org, isLoading, error } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.get(`/api/orgs/by-slug/${slug}`).then(r => r.data)
  })

  if (isLoading) return <Loading />
  if (error || !org?.ativo) return <OrgNaoEncontrada slug={slug} />

  return <Routes>...</Routes>
}
```

### Axios interceptors

```typescript
// frontend/src/lib/api.ts

// Request: injeta Bearer token
axios.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) config.headers.Authorization = `Bearer ${session.access_token}`
  return config
})

// Response: auto-logout em 401
axios.interceptors.response.use(
  res => res,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

### CORS no backend (wildcard subdomain)

```typescript
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const ok = /^https:\/\/([a-z0-9-]+\.)?orrin\.com$/.test(origin)
    cb(ok ? null : new Error('CORS bloqueado'), ok)
  },
  credentials: true
}))
```

---

## Seção 4: Super Admin + Infraestrutura

### API do Super Admin (`admin.orrin.com`)

```
GET  /api/admin/tenants          → lista orgs (ativas + inativas)
POST /api/admin/tenants          → cria org + envia invite por email
PATCH /api/admin/tenants/:id     → ativa/desativa (soft delete via deleted_at)
```

#### `POST /api/admin/tenants`

```typescript
// Body: { slug, nome, admin_email }
// Sem senha no body — usa invite por email

async function criarTenant({ slug, nome, admin_email }) {
  validarSlug(slug)  // regex + RESERVED + length

  // 1. Criar org
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug, nome })
    .select()
    .single()

  // 2. Enviar invite (com rollback se falhar)
  try {
    await supabase.auth.admin.inviteUserByEmail(admin_email, {
      data: { tenant_id: org.id, role: 'admin' },
      redirectTo: `https://${slug}.orrin.com/set-password`
    })
  } catch (err) {
    await supabase.from('organizacoes').delete().eq('id', org.id)
    throw err
  }

  return {
    org,
    url: `https://${slug}.orrin.com`,
    invite_enviado: true
  }
}
```

#### Validação de slug

```typescript
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/
const RESERVED = ['admin','api','app','www','mail','blog','docs','status','cdn','static','help','support']

function validarSlug(slug: string) {
  if (!SLUG_REGEX.test(slug))     throw new Error('Slug inválido (só minúsculas, números e hífen)')
  if (RESERVED.includes(slug))    throw new Error('Slug reservado')
  if (slug.length > 63)           throw new Error('Slug muito longo (máx 63 caracteres)')
}
```

### Infraestrutura

**Cloudflare DNS (2 entradas):**
```
CNAME  *  →  cname.vercel-dns.com
CNAME  @  →  cname.vercel-dns.com
```

**Vercel (Settings → Domains):**
```
*.orrin.com        ← cobre todos os tenants + SSL automático
orrin.com          ← raiz
```

**Variáveis de ambiente no Vercel:**
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
UAZAPI_URL=
UAZAPI_TOKEN=
```

---

## Checklist Final

### Database
- [ ] Tabela `organizacoes` com slug CITEXT + soft delete
- [ ] `tenant_id` em todas as tabelas com FK
- [ ] Unique composto `(tenant_id, telefone)` em clientes
- [ ] ENABLE ROW LEVEL SECURITY em todas as tabelas
- [ ] Indexes simples e compostos em tenant_id
- [ ] Policy `tenant_isolation` com WITH CHECK + bypass super_admin
- [ ] Função `auth.tenant_id()`
- [ ] Auth Hook: injeta `tenant_id` + `role` no JWT
- [ ] Trigger: sincroniza auth.users → public.usuarios
- [ ] Tabela `admin_audit_log`

### Auth
- [ ] Middleware `requireAuth` com validação slug ↔ tenant_id
- [ ] Middleware `requireSuperAdmin` com audit log automático
- [ ] Rota pública `GET /api/orgs/by-slug/:slug`

### Frontend
- [ ] `getTenantSlug()` robusto (RESERVED + regex + null)
- [ ] `TenantContext` global
- [ ] Roteamento: null → LandingPage, admin → SuperAdmin, * → ClientApp
- [ ] `ClientApp` valida org antes de renderizar
- [ ] Supabase client com `storageKey` por tenant
- [ ] Axios interceptors (Bearer token + auto-logout 401)
- [ ] CORS wildcard no backend

### Super Admin
- [ ] `POST /api/admin/tenants`: cria org + invite email + rollback
- [ ] `GET /api/admin/tenants`: lista orgs
- [ ] `PATCH /api/admin/tenants/:id`: soft delete / reativar
- [ ] Validação rigorosa de slug
- [ ] Painel React em `admin.orrin.com`

### Infra
- [ ] Cloudflare: 2 entradas CNAME wildcard
- [ ] Vercel: `*.orrin.com` com SSL automático
- [ ] Variáveis de ambiente configuradas
