# Multi-Tenant com Subdomínios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte multi-tenant ao Orrin CRM com isolamento por `tenant_id` + RLS no Supabase, acesso por subdomínio `empresa.orrin.com`, e painel super admin em `admin.orrin.com`.

**Architecture:** Schema único no Supabase com `tenant_id` em todas as tabelas, protegido por RLS policies que lêem o `tenant_id` do JWT via Auth Hook. Backend Express valida o slug do subdomínio contra o `tenant_id` do JWT em cada request. Frontend detecta o slug do `window.location.hostname` e roteia para ClientApp, SuperAdminApp ou LandingPage.

**Tech Stack:** Node.js + Express + TypeScript, Supabase (PostgreSQL + Auth + RLS), React 19 + Vite + TypeScript, `jsonwebtoken` (já instalado), `@supabase/supabase-js` (frontend: adicionar), Tailwind CSS.

---

## File Structure

### Criar
- `supabase/migrations/003_multi_tenant.sql` — toda a migração DB: organizacoes, tenant_id, RLS, indexes, auth hook, trigger, audit log
- `backend/src/lib/slug.ts` — `validarSlug()` com regex + RESERVED
- `backend/src/middleware/auth.ts` — `requireAuth`, `requireSuperAdmin`, `logAdminAction`
- `backend/src/routes/orgs.ts` — `GET /api/orgs/by-slug/:slug` (público, service role)
- `backend/src/routes/admin.ts` — `GET/POST/PATCH /api/admin/tenants` (super admin)
- `frontend/src/lib/tenant.ts` — `getTenantSlug()` robusto
- `frontend/src/lib/supabase.ts` — cliente Supabase com `storageKey` por tenant
- `frontend/src/lib/api.ts` — axios com interceptors (Bearer + auto-logout 401)
- `frontend/src/pages/Login.tsx` — tela de login para tenants
- `frontend/src/pages/LandingPage.tsx` — slug null → landing
- `frontend/src/pages/OrgNaoEncontrada.tsx` — org inativa ou inexistente
- `frontend/src/pages/SetPassword.tsx` — definir senha após invite
- `frontend/src/pages/SuperAdminApp.tsx` — painel admin.orrin.com

### Modificar
- `backend/src/services/supabase.ts` — corrigir `SUPABASE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`, adicionar `supabaseAdmin`
- `backend/src/types/index.ts` — adicionar `Organizacao`, atualizar `JWTPayload` com `tenant_id`
- `backend/src/routes/clientes.ts` — proteger com `requireAuth`, filtrar por `req.user.tenant_id`
- `backend/src/routes/reunioes.ts` — proteger com `requireAuth`, filtrar por `req.user.tenant_id`
- `backend/src/routes/webhook.ts` — aceitar `/:tenantSlug` no path, lookup tenant
- `backend/src/index.ts` — CORS wildcard, registrar novas rotas
- `frontend/src/App.tsx` — roteamento completo por subdomínio
- `.env.example` — adicionar `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## Task 1: Migration SQL — Multi-Tenant

**Files:**
- Create: `supabase/migrations/003_multi_tenant.sql`

- [ ] **Step 1: Criar arquivo de migração**

```sql
-- supabase/migrations/003_multi_tenant.sql

-- Extensão para CITEXT (case-insensitive text)
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- TABELA: organizacoes
-- ============================================================
CREATE TABLE organizacoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       CITEXT UNIQUE NOT NULL,
  nome       VARCHAR(255) NOT NULL,
  ativo      BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organizacoes_slug ON organizacoes(slug) WHERE deleted_at IS NULL;

-- ============================================================
-- ADICIONAR tenant_id EM TODAS AS TABELAS
-- ============================================================
ALTER TABLE usuarios      ADD COLUMN tenant_id UUID REFERENCES organizacoes(id);
ALTER TABLE clientes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE reunioes      ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE conversas     ADD COLUMN tenant_id UUID NOT NULL REFERENCES organizacoes(id);
ALTER TABLE configuracoes ADD COLUMN tenant_id UUID UNIQUE NOT NULL REFERENCES organizacoes(id);

-- Unique composto: mesmo telefone pode existir em tenants diferentes
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_telefone_key;
ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_telefone UNIQUE (tenant_id, telefone);

-- ============================================================
-- INDEXES EM tenant_id
-- ============================================================
CREATE INDEX idx_clientes_tenant          ON clientes(tenant_id);
CREATE INDEX idx_reunioes_tenant          ON reunioes(tenant_id);
CREATE INDEX idx_conversas_tenant         ON conversas(tenant_id);
CREATE INDEX idx_usuarios_tenant          ON usuarios(tenant_id);
CREATE INDEX idx_clientes_tenant_telefone ON clientes(tenant_id, telefone);
CREATE INDEX idx_reunioes_tenant_data     ON reunioes(tenant_id, data_hora);

-- ============================================================
-- RLS: ativar em todas as tabelas
-- ============================================================
ALTER TABLE clientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNÇÃO: extrai tenant_id do JWT
-- ============================================================
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID
$$ LANGUAGE sql STABLE;

-- ============================================================
-- POLICIES em tabelas de negócio (clientes, reunioes, conversas, usuarios, configuracoes)
-- ============================================================
CREATE POLICY "tenant_isolation" ON clientes
  USING      (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON reunioes
  USING      (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON conversas
  USING      (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON usuarios
  USING      (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON configuracoes
  USING      (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

-- Policy em organizacoes: usuário vê só a sua, super_admin vê todas
CREATE POLICY "org_self_read" ON organizacoes
  USING (id = auth.tenant_id() OR (auth.jwt() ->> 'role') = 'super_admin');

-- ============================================================
-- AUDIT LOG (somente super_admin)
-- ============================================================
CREATE TABLE admin_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES usuarios(id),
  action     VARCHAR(50) NOT NULL,
  target_id  UUID,
  metadata   JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_super_admin_only" ON admin_audit_log
  USING      ((auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'super_admin');

-- ============================================================
-- AUTH HOOK: injeta tenant_id + role no JWT
-- (Ativar em: Authentication → Hooks → Custom Access Token)
-- ============================================================
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

-- ============================================================
-- TRIGGER: sincroniza auth.users → public.usuarios
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'tenant_id' OR (NEW.raw_user_meta_data->>'role') = 'super_admin' THEN
    INSERT INTO public.usuarios (id, email, tenant_id, role)
    VALUES (
      NEW.id,
      NEW.email,
      NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid,
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

- [ ] **Step 2: Verificar SQL**

Abrir o arquivo e confirmar que as seções estão na ordem correta:
1. `CREATE EXTENSION citext`
2. `CREATE TABLE organizacoes`
3. `ALTER TABLE ... ADD COLUMN tenant_id`
4. Indexes
5. `ENABLE ROW LEVEL SECURITY`
6. `auth.tenant_id()` function
7. Policies
8. `admin_audit_log`
9. Auth Hook function
10. Trigger

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_multi_tenant.sql
git commit -m "feat: migration multi-tenant — organizacoes, tenant_id, RLS, indexes, auth hook, trigger"
```

---

## Task 2: Backend types — adicionar Organizacao + atualizar JWTPayload

**Files:**
- Modify: `backend/src/types/index.ts`

- [ ] **Step 1: Substituir conteúdo completo do arquivo**

```typescript
// backend/src/types/index.ts

export type StatusCliente = 'novo' | 'contato_feito' | 'reuniao_agendada' | 'cliente' | 'perdido'
export type StatusReuniао = 'agendada' | 'confirmada' | 'cancelada' | 'realizada'
export type RoleUsuario = 'admin' | 'vendedor' | 'super_admin'
export type TipoRemetente = 'agente' | 'humano'

export interface Organizacao {
  id: string
  slug: string
  nome: string
  ativo: boolean
  deleted_at: string | null
  created_at: string
}

export interface Cliente {
  id: string
  tenant_id: string
  telefone: string
  nome: string | null
  empresa: string | null
  email: string | null
  status: StatusCliente
  ultimo_contato_at: string | null
  created_at: string
  updated_at: string
}

export interface Reuniao {
  id: string
  tenant_id: string
  cliente_id: string
  data_hora: string
  status: StatusReuniао
  notas: string | null
  link_reuniao?: string
  created_at: string
  updated_at: string
  cliente?: Cliente
}

export interface Conversa {
  id: string
  tenant_id: string
  cliente_id: string
  mensagem_cliente: string | null
  mensagem_agente: string | null
  tipo_remetente: TipoRemetente
  modo_humano: boolean
  created_at: string
}

export interface Usuario {
  id: string
  tenant_id: string | null
  email: string
  role: RoleUsuario
}

export interface JWTPayload {
  sub: string
  email: string
  role: RoleUsuario
  tenant_id: string | null
}

export interface ConfiguracaoOrrin {
  tenant_id: string
  empresa_nome: string
  email_contato: string
  telefone: string | null
  prompt_pedro: string
  timezone: string
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/types/index.ts
git commit -m "feat: adicionar Organizacao e tenant_id nos types"
```

---

## Task 3: Backend services/supabase.ts — corrigir env + adicionar supabaseAdmin

**Files:**
- Modify: `backend/src/services/supabase.ts`

- [ ] **Step 1: Substituir conteúdo completo**

```typescript
// backend/src/services/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!

// Cliente anon — respeita RLS (use em rotas autenticadas normais)
export const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)

// Cliente admin — bypassa RLS (use APENAS em rotas públicas e super admin)
export const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/supabase.ts
git commit -m "fix: corrigir SUPABASE_KEY para SERVICE_ROLE_KEY e adicionar supabaseAdmin"
```

---

## Task 4: Backend lib/slug.ts — validarSlug

**Files:**
- Create: `backend/src/lib/slug.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// backend/src/lib/slug.ts

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/
const RESERVED = [
  'admin', 'api', 'app', 'www', 'mail', 'blog', 'docs',
  'status', 'cdn', 'static', 'help', 'support'
]

export function validarSlug(slug: string): void {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Slug é obrigatório')
  }
  const lower = slug.toLowerCase()
  if (!SLUG_REGEX.test(lower)) {
    throw new Error('Slug inválido — use apenas letras minúsculas, números e hífen')
  }
  if (RESERVED.includes(lower)) {
    throw new Error(`Slug '${lower}' é reservado`)
  }
  if (lower.length > 63) {
    throw new Error('Slug muito longo — máximo 63 caracteres')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/slug.ts
git commit -m "feat: validarSlug com regex + lista de reservados"
```

---

## Task 5: Backend routes/orgs.ts — rota pública by-slug

**Files:**
- Create: `backend/src/routes/orgs.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// backend/src/routes/orgs.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// Rota pública — chamada antes do login para validar se a org existe
// Usa supabaseAdmin (service role) para bypassar RLS
// Retorna apenas campos públicos — nunca expor prompt_pedro ou dados sensíveis
router.get('/by-slug/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params

  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, nome, ativo, slug')
    .eq('slug', slug.toLowerCase())
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Organização não encontrada' })
  }

  if (!data.ativo) {
    return res.status(404).json({ error: 'Organização não disponível' })
  }

  res.json(data)
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/orgs.ts
git commit -m "feat: rota pública GET /api/orgs/by-slug/:slug"
```

---

## Task 6: Backend middleware/auth.ts — requireAuth + requireSuperAdmin

**Files:**
- Create: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { JWTPayload } from '../types'

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string }
    }
  }
}

// Cache simples de org por slug (evita hit no DB a cada request)
const orgCache = new Map<string, { id: string; ativo: boolean; expires: number }>()

async function getOrgBySlug(slug: string) {
  const cached = orgCache.get(slug)
  if (cached && cached.expires > Date.now()) return cached

  const { data } = await supabaseAdmin
    .from('organizacoes')
    .select('id, ativo')
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (data) {
    orgCache.set(slug, { ...data, expires: Date.now() + 60_000 }) // 60s cache
  }
  return data
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'Token ausente' })
  }

  let payload: JWTPayload & { sub: string }
  try {
    payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as any
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  // Super admin: bypass da validação de slug
  if (payload.role === 'super_admin') {
    req.user = { id: payload.sub, ...payload }
    return next()
  }

  // Tenant normal: validar slug do Host contra tenant_id do JWT
  const host = req.headers.host || ''
  const slug = host.split('.')[0]

  if (!slug || slug === 'admin') {
    return res.status(403).json({ error: 'Domínio inválido' })
  }

  const org = await getOrgBySlug(slug)
  if (!org || !org.ativo) {
    return res.status(403).json({ error: 'Organização não disponível' })
  }
  if (org.id !== payload.tenant_id) {
    return res.status(403).json({ error: 'Token inválido para este domínio' })
  }

  req.user = { id: payload.sub, ...payload }
  next()
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  next()
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetId?: string,
  metadata?: object
) {
  await supabaseAdmin.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_id: targetId,
    metadata,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "feat: middleware requireAuth, requireSuperAdmin, logAdminAction"
```

---

## Task 7: Backend routes/admin.ts — CRUD de tenants

**Files:**
- Create: `backend/src/routes/admin.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { validarSlug } from '../lib/slug'
import { logAdminAction } from '../middleware/auth'

const router = Router()

// Listar todas as orgs (ativas + inativas, exceto deletadas)
router.get('/tenants', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, slug, nome, ativo, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Criar nova org + enviar invite ao admin do cliente
router.post('/tenants', async (req: Request, res: Response) => {
  const { slug, nome, admin_email } = req.body

  if (!slug || !nome || !admin_email) {
    return res.status(400).json({ error: 'slug, nome e admin_email são obrigatórios' })
  }

  try {
    validarSlug(slug)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }

  // 1. Criar org
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizacoes')
    .insert({ slug: slug.toLowerCase(), nome })
    .select()
    .single()

  if (orgError) {
    if (orgError.code === '23505') {
      return res.status(409).json({ error: 'Slug já está em uso' })
    }
    return res.status(400).json({ error: orgError.message })
  }

  // 2. Enviar invite com rollback se falhar
  try {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      admin_email,
      {
        data: { tenant_id: org.id, role: 'admin' },
        redirectTo: `https://${slug}.orrin.com/set-password`,
      }
    )
    if (inviteError) throw inviteError
  } catch (err: any) {
    await supabaseAdmin.from('organizacoes').delete().eq('id', org.id)
    return res.status(400).json({ error: `Falha ao enviar invite: ${err.message}` })
  }

  await logAdminAction(req.user!.id, 'create_org', org.id, { slug, nome, admin_email })

  res.status(201).json({
    org: { id: org.id, slug: org.slug, nome: org.nome },
    url: `https://${slug}.orrin.com`,
    invite_enviado: true,
  })
})

// Ativar / desativar org (soft delete via deleted_at)
router.patch('/tenants/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { ativo } = req.body

  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ error: 'Campo ativo (boolean) é obrigatório' })
  }

  const updateData: any = { ativo }
  if (!ativo) updateData.deleted_at = new Date().toISOString()
  else updateData.deleted_at = null

  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await logAdminAction(req.user!.id, ativo ? 'activate_org' : 'deactivate_org', id)

  res.json(data)
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/admin.ts
git commit -m "feat: rotas super admin — GET/POST/PATCH /api/admin/tenants"
```

---

## Task 8: Backend index.ts — CORS wildcard + registrar novas rotas

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Substituir conteúdo completo**

```typescript
// backend/src/index.ts
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import clientesRouter from './routes/clientes'
import reunioesRouter from './routes/reunioes'
import webhookRouter from './routes/webhook'
import orgsRouter from './routes/orgs'
import adminRouter from './routes/admin'
import { requireAuth, requireSuperAdmin } from './middleware/auth'

dotenv.config()

const app = express()

app.use(express.json())

// CORS: permite qualquer subdomínio de orrin.com + localhost em dev
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // curl / Postman
    const ok =
      /^https:\/\/([a-z0-9-]+\.)?orrin\.com$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin)
    cb(ok ? null : new Error('CORS bloqueado'), ok)
  },
  credentials: true,
}))

// Rotas públicas (sem auth)
app.use('/api/orgs', orgsRouter)

// Webhook do WhatsApp — autenticado via tenantSlug na URL
app.use('/api/webhook', webhookRouter)

// Rotas de tenant (requerem auth + tenant válido)
app.use('/api/clientes',  requireAuth, clientesRouter)
app.use('/api/reunioes',  requireAuth, reunioesRouter)

// Rotas super admin
app.use('/api/admin', requireAuth, requireSuperAdmin, adminRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`)
})

export default app
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: CORS wildcard subdomain + registrar rotas orgs e admin"
```

---

## Task 9: Proteger rotas existentes — clientes, reunioes, webhook

**Files:**
- Modify: `backend/src/routes/clientes.ts`
- Modify: `backend/src/routes/reunioes.ts`
- Modify: `backend/src/routes/webhook.ts`

- [ ] **Step 1: Atualizar clientes.ts — filtrar por tenant_id**

```typescript
// backend/src/routes/clientes.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Cliente não encontrado' })
  res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const { telefone, nome, empresa, email } = req.body
  if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' })

  const { data, error } = await supabaseAdmin
    .from('clientes')
    .insert({ telefone, nome, empresa, email, status: 'novo', tenant_id: req.user!.tenant_id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('clientes')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Cliente deletado' })
})

export default router
```

- [ ] **Step 2: Atualizar reunioes.ts — filtrar por tenant_id**

```typescript
// backend/src/routes/reunioes.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('reunioes')
    .select('*, clientes(*)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data_hora', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const { cliente_id, data_hora } = req.body
  if (!cliente_id || !data_hora) {
    return res.status(400).json({ error: 'cliente_id e data_hora são obrigatórios' })
  }

  const { data, error } = await supabaseAdmin
    .from('reunioes')
    .insert({ cliente_id, data_hora, status: 'agendada', tenant_id: req.user!.tenant_id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await supabaseAdmin
    .from('clientes')
    .update({ status: 'reuniao_agendada' })
    .eq('id', cliente_id)
    .eq('tenant_id', req.user!.tenant_id)

  res.status(201).json(data)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('reunioes')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('reunioes')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Reunião deletada' })
})

export default router
```

- [ ] **Step 3: Atualizar webhook.ts — aceitar tenantSlug na URL**

```typescript
// backend/src/routes/webhook.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { processarMensagemCliente, detectarIntencaoReuniao } from '../agents/pedro'

const router = Router()

// URL: POST /api/webhook/whatsapp/:tenantSlug
// Cada instância UAZAPI do cliente aponta pra este URL com seu próprio slug
router.post('/whatsapp/:tenantSlug', async (req: Request, res: Response) => {
  try {
    const { tenantSlug } = req.params
    const { data: msg } = req.body

    if (!msg?.message?.text?.body) return res.json({ result: 'ok' })

    // Buscar org pelo slug
    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('id, ativo')
      .eq('slug', tenantSlug.toLowerCase())
      .is('deleted_at', null)
      .single()

    if (!org || !org.ativo) return res.status(404).json({ error: 'Org não encontrada' })

    const telefone = msg.from
    const mensagem = msg.message.text.body
    const tenantId = org.id

    // Buscar ou criar cliente
    let { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('telefone', telefone)
      .eq('tenant_id', tenantId)
      .single()

    if (!cliente) {
      const { data: novo } = await supabaseAdmin
        .from('clientes')
        .insert({ telefone, status: 'novo', tenant_id: tenantId })
        .select()
        .single()
      cliente = novo
    }

    const resposta = await processarMensagemCliente(cliente.id, mensagem)

    await fetch(`${process.env.UAZAPI_URL}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.UAZAPI_TOKEN}`,
      },
      body: JSON.stringify({ phone: telefone, message: resposta }),
    })

    if (detectarIntencaoReuniao(mensagem)) {
      console.log(`[INTENÇÃO REUNIÃO] cliente ${cliente.id} tenant ${tenantId}`)
    }

    res.json({ result: 'ok' })
  } catch (err) {
    console.error('Erro webhook:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default router
```

- [ ] **Step 4: Verificar que TypeScript compila**

```bash
cd backend && npm run build
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/clientes.ts backend/src/routes/reunioes.ts backend/src/routes/webhook.ts
git commit -m "feat: proteger rotas com tenant_id, webhook aceita :tenantSlug na URL"
```

---

## Task 10: Frontend — adicionar @supabase/supabase-js

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Instalar dependência**

```bash
cd frontend && npm install @supabase/supabase-js
```

Expected: `@supabase/supabase-js` aparece em `dependencies` no `package.json`.

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: adicionar @supabase/supabase-js ao frontend"
```

---

## Task 11: Frontend lib/tenant.ts — getTenantSlug robusto

**Files:**
- Create: `frontend/src/lib/tenant.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// frontend/src/lib/tenant.ts

const ROOT_DOMAIN = 'orrin.com'
const RESERVED = [
  'www', 'admin', 'api', 'app', 'mail', 'blog', 'docs',
  'status', 'cdn', 'static', 'help', 'support'
]

export function getTenantSlug(): string | null {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_DEV_TENANT ?? 'demo'
  }

  const hostname = window.location.hostname

  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null

  const slug = hostname.replace(`.${ROOT_DOMAIN}`, '').toLowerCase()

  if (RESERVED.includes(slug)) return slug  // 'admin' é tratado em App.tsx
  if (!/^[a-z0-9-]+$/.test(slug)) return null

  return slug
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/tenant.ts
git commit -m "feat: getTenantSlug com detecção robusta de subdomain"
```

---

## Task 12: Frontend lib/supabase.ts — cliente com storageKey por tenant

**Files:**
- Create: `frontend/src/lib/supabase.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// frontend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { getTenantSlug } from './tenant'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `sb-auth-${getTenantSlug()}`,  // sessão isolada por tenant
    },
  }
)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/supabase.ts
git commit -m "feat: supabase client com storageKey isolado por tenant"
```

---

## Task 13: Frontend lib/api.ts — axios com interceptors

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// frontend/src/lib/api.ts
import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
})

// Injetar Bearer token em toda requisição
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

// Auto-logout ao receber 401 (refresh token expirado)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: axios com Bearer token automático e auto-logout no 401"
```

---

## Task 14: Frontend pages/Login.tsx

**Files:**
- Create: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Criar arquivo**

```typescript
// frontend/src/pages/Login.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  orgNome: string
}

export default function Login({ orgNome }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou senha incorretos')
    }
    // Supabase SDK atualiza a sessão automaticamente após login bem-sucedido
    // App.tsx detecta via onAuthStateChange e redireciona para o dashboard

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{orgNome}</h1>
        <p className="text-gray-500 text-sm mb-6">Faça login para acessar o CRM</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Login.tsx
git commit -m "feat: página de login por tenant"
```

---

## Task 15: Frontend pages auxiliares — LandingPage + OrgNaoEncontrada + SetPassword

**Files:**
- Create: `frontend/src/pages/LandingPage.tsx`
- Create: `frontend/src/pages/OrgNaoEncontrada.tsx`
- Create: `frontend/src/pages/SetPassword.tsx`

- [ ] **Step 1: Criar LandingPage.tsx**

```typescript
// frontend/src/pages/LandingPage.tsx
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-center text-white max-w-xl px-6">
        <h1 className="text-5xl font-bold mb-4">Orrin CRM</h1>
        <p className="text-xl text-blue-100 mb-8">
          CRM de prospecção com agente IA para captar mais clientes
        </p>
        <p className="text-blue-200 text-sm">
          Acesse o CRM pelo link fornecido pela equipe Orrin
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar OrgNaoEncontrada.tsx**

```typescript
// frontend/src/pages/OrgNaoEncontrada.tsx
interface Props {
  slug: string
}

export default function OrgNaoEncontrada({ slug }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Organização não encontrada</h2>
        <p className="text-gray-500">
          Nenhuma organização ativa encontrada para <code className="bg-gray-100 px-2 py-1 rounded">{slug}</code>.
        </p>
        <p className="text-gray-400 text-sm mt-4">
          Verifique o link com a equipe Orrin.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Criar SetPassword.tsx**

```typescript
// frontend/src/pages/SetPassword.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-green-600 font-semibold text-xl">Senha definida com sucesso!</p>
          <p className="text-gray-500 text-sm mt-2">Redirecionando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Definir senha</h1>
        <p className="text-gray-500 text-sm mb-6">Crie uma senha para acessar seu CRM</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mínimo 8 caracteres"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Repita a senha"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? 'Salvando...' : 'Definir senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx frontend/src/pages/OrgNaoEncontrada.tsx frontend/src/pages/SetPassword.tsx
git commit -m "feat: páginas LandingPage, OrgNaoEncontrada, SetPassword"
```

---

## Task 16: Frontend pages/SuperAdminApp.tsx — painel admin.orrin.com

**Files:**
- Create: `frontend/src/pages/SuperAdminApp.tsx`

- [ ] **Step 1: Criar arquivo**

```typescript
// frontend/src/pages/SuperAdminApp.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

export default function SuperAdminApp() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [novaOrg, setNovaOrg] = useState({ slug: '', nome: '', admin_email: '' })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const queryClient = useQueryClient()

  // Verificar sessão existente
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) setSession(session)
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoginError('Credenciais inválidas'); return }
    setSession(data.session)
  }

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/api/admin/tenants').then(r => r.data),
    enabled: !!session,
  })

  const createMutation = useMutation({
    mutationFn: (org: typeof novaOrg) => api.post('/api/admin/tenants', org).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
      setNovaOrg({ slug: '', nome: '', admin_email: '' })
      setFormSuccess(`✅ Criado! URL: ${data.url} — Invite enviado para ${novaOrg.admin_email}`)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || 'Erro ao criar organização')
      setFormSuccess('')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.patch(`/api/admin/tenants/${id}`, { ativo }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg w-full max-w-sm">
          <h1 className="text-white text-2xl font-bold mb-6">Orrin Admin</h1>
          {loginError && <p className="text-red-400 text-sm mb-4">{loginError}</p>}
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded p-3 focus:outline-none focus:border-blue-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded p-3 focus:outline-none focus:border-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Orrin Admin</h1>
        <button
          onClick={() => supabase.auth.signOut().then(() => setSession(null))}
          className="text-gray-400 hover:text-white text-sm"
        >
          Sair
        </button>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        {/* Formulário de nova org */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Nova Organização</h2>

          {formError && <p className="mb-3 text-red-600 text-sm">{formError}</p>}
          {formSuccess && <p className="mb-3 text-green-600 text-sm">{formSuccess}</p>}

          <div className="grid grid-cols-3 gap-4 mb-4">
            <input
              type="text"
              placeholder="slug (ex: empresa-abc)"
              value={novaOrg.slug}
              onChange={e => setNovaOrg({ ...novaOrg, slug: e.target.value.toLowerCase() })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Nome da empresa"
              value={novaOrg.nome}
              onChange={e => setNovaOrg({ ...novaOrg, nome: e.target.value })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email do admin"
              value={novaOrg.admin_email}
              onChange={e => setNovaOrg({ ...novaOrg, admin_email: e.target.value })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={() => createMutation.mutate(novaOrg)}
            disabled={createMutation.isPending}
            className="bg-blue-600 text-white px-6 py-3 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {createMutation.isPending ? 'Criando...' : '+ Criar Organização'}
          </button>
        </div>

        {/* Lista de orgs */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold text-gray-800">
              Organizações ({tenants.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Slug</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Nome</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">URL</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t: any) => (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-mono text-sm text-gray-700">{t.slug}</td>
                    <td className="p-4 text-gray-800">{t.nome}</td>
                    <td className="p-4">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${t.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <a
                        href={`https://${t.slug}.orrin.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {t.slug}.orrin.com
                      </a>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleMutation.mutate({ id: t.id, ativo: !t.ativo })}
                        className={`text-sm px-3 py-1 rounded border transition ${
                          t.ativo
                            ? 'border-red-300 text-red-600 hover:bg-red-50'
                            : 'border-green-300 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {t.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SuperAdminApp.tsx
git commit -m "feat: painel super admin em admin.orrin.com"
```

---

## Task 17: Frontend App.tsx — roteamento completo por subdomínio

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Substituir App.tsx completamente**

```typescript
// frontend/src/App.tsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { supabase } from './lib/supabase'
import { getTenantSlug } from './lib/tenant'
import LandingPage from './pages/LandingPage'
import OrgNaoEncontrada from './pages/OrgNaoEncontrada'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import SuperAdminApp from './pages/SuperAdminApp'
import Prospeccao from './pages/Prospeccao'
import Clientes from './pages/Clientes'
import Reunioes from './pages/Reunioes'
import './App.css'

const slug = getTenantSlug()

function ClientApp() {
  const [session, setSession] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState('prospeccao')
  const isSetPassword = window.location.pathname === '/set-password'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Validar org via API pública
  const { data: org, isLoading, error } = useQuery({
    queryKey: ['org', slug],
    queryFn: () =>
      axios
        .get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/orgs/by-slug/${slug}`)
        .then(r => r.data),
    enabled: !!slug && slug !== 'admin',
  })

  if (isSetPassword) return <SetPassword />
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    )
  }
  if (error || !org?.ativo) return <OrgNaoEncontrada slug={slug!} />
  if (!session) return <Login orgNome={org.nome} />

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">{org.nome}</h1>
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setCurrentPage('prospeccao')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'prospeccao' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentPage('clientes')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'clientes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Clientes
              </button>
              <button
                onClick={() => setCurrentPage('reunioes')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'reunioes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Reuniões
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main>
        {currentPage === 'prospeccao' && <Prospeccao />}
        {currentPage === 'clientes' && <Clientes />}
        {currentPage === 'reunioes' && <Reunioes />}
      </main>
    </div>
  )
}

export default function App() {
  if (slug === null)     return <LandingPage />
  if (slug === 'admin')  return <SuperAdminApp />
  return <ClientApp />
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npm run build
```

Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: App.tsx com roteamento completo por subdomain (landing / admin / client)"
```

---

## Task 18: Atualizar .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Substituir conteúdo**

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_JWT_SECRET=     # Supabase → Settings → API → JWT Secret

# JWT
JWT_SECRET=string-aleatoria-longa-unica-por-instalacao

# UAZAPI (WhatsApp)
UAZAPI_URL=https://sua-instancia.uazapi.com
UAZAPI_TOKEN=seu-token-uazapi

# Anthropic (Claude API)
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3001

# Frontend (variáveis VITE_)
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DEV_TENANT=empresa-teste     # slug usado em desenvolvimento local
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: adicionar SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY e variáveis VITE_ ao .env.example"
```

---

## Self-Review — Spec Coverage

Verificando todas as seções do spec contra as tasks:

| Requisito do Spec | Task |
|---|---|
| Tabela `organizacoes` com slug CITEXT + soft delete | Task 1 |
| `tenant_id` em todas as tabelas | Task 1 |
| Unique composto `(tenant_id, telefone)` | Task 1 |
| ENABLE RLS em todas as tabelas (incluindo orgs e audit_log) | Task 1 |
| Indexes simples e compostos | Task 1 |
| Policies com WITH CHECK + bypass super_admin | Task 1 |
| Policy `org_self_read` em organizacoes | Task 1 |
| Policy `audit_super_admin_only` em admin_audit_log | Task 1 |
| `auth.tenant_id()` function | Task 1 |
| Auth Hook injeta tenant_id + role | Task 1 |
| Trigger `handle_new_user` com super_admin via NULLIF | Task 1 |
| Types: Organizacao, JWTPayload com tenant_id | Task 2 |
| `supabaseAdmin` com SERVICE_ROLE_KEY | Task 3 |
| `validarSlug` com regex + RESERVED | Task 4 |
| `GET /api/orgs/by-slug/:slug` via service role | Task 5 |
| `requireAuth` com `jwt.verify + SUPABASE_JWT_SECRET` | Task 6 |
| Validação slug ↔ tenant_id em todo request | Task 6 |
| `requireSuperAdmin` + `logAdminAction` | Task 6 |
| `POST /api/admin/tenants` com rollback atômico + invite | Task 7 |
| `GET /api/admin/tenants` | Task 7 |
| `PATCH /api/admin/tenants/:id` (soft delete) | Task 7 |
| CORS wildcard subdomain | Task 8 |
| Rotas protegidas com `requireAuth` | Task 8 + 9 |
| Clientes/reunioes filtram por `tenant_id` | Task 9 |
| Webhook aceita `:tenantSlug` na URL | Task 9 |
| Frontend `@supabase/supabase-js` instalado | Task 10 |
| `getTenantSlug()` robusto | Task 11 |
| Supabase client com `storageKey` por tenant | Task 12 |
| Axios interceptors (Bearer + auto-logout 401) | Task 13 |
| Login page | Task 14 |
| LandingPage (slug null) | Task 15 |
| OrgNaoEncontrada | Task 15 |
| SetPassword (após invite) | Task 15 |
| SuperAdminApp em admin.orrin.com | Task 16 |
| Roteamento: null→Landing, admin→SuperAdmin, *→ClientApp | Task 17 |
| ClientApp valida org antes de renderizar | Task 17 |
| `SUPABASE_JWT_SECRET` nas env vars | Task 18 |
| `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas env vars | Task 18 |

**Cobertura: 100%** ✅  
**Placeholders encontrados: 0** ✅  
**Consistência de tipos: verificada** ✅ (`req.user.tenant_id`, `supabaseAdmin`, `validarSlug` usados consistentemente)
