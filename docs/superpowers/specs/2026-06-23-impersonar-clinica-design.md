# "Entrar como" (Impersonar Clínica, Somente Leitura) — Orrin CRM

**Data:** 2026-06-23
**Status:** Aprovado
**Arquitetura:** Token JWT de curta duração com claim `impersonate_tenant_id`, validado contra o papel real do usuário no banco a cada request — reaproveita 100% das rotas e telas existentes, sem nenhum código novo de "modo clínica".

---

## Contexto

Hoje o `super_admin` consegue logar em qualquer subdomínio (`requireAuth` pula a checagem de organização pra esse papel), mas todas as rotas da clínica devolvem array/objeto vazio quando `tenant_id` é nulo — então ele não vê dado real de nenhuma clínica. O pedido: um super_admin conseguir "entrar como" uma clínica específica pra visualizar os dados reais dela, em modo **somente leitura**.

## Por que isso funciona sem duplicar nada

`requireAuth` (`backend/src/middleware/auth.ts`) já busca `role`/`tenant_id` direto da tabela `usuarios` a cada request — **nunca confia no que está no JWT** além do `sub` (id do usuário). Isso é a peça-chave: um token de impersonação carrega uma claim extra (`impersonate_tenant_id`), mas só é honrada se a busca no banco confirmar que aquele `sub` é *de fato* `super_admin`. Se alguém adulterar um token tentando forjar essa claim sem ser super_admin de verdade, ela é ignorada.

Com a claim aceita, `requireAuth` monta o `req.user` com `role: 'admin'` e `tenant_id: <clinica-alvo>` — e a partir daí **todas as rotas e toda a UI da clínica funcionam exatamente como funcionam hoje pra um admin real**, porque já filtram tudo por `tenant_id`. Não precisa adaptar `Pacientes.tsx`, `Agenda.tsx`, nem nenhuma rota de backend.

## Decisões Finais

| Tópico | Decisão |
|---|---|
| Nível de acesso | Somente leitura — qualquer request que não seja `GET` enquanto impersonando devolve 403 |
| Duração do token de impersonação | 1 hora (vs. 7 dias do login normal) |
| Onde aparece o botão | Painel Admin → Clínicas, só em clínicas **ativas** (impersonar uma inativa cairia direto no 403 "Organização não disponível", que já existe hoje) |
| Como troca de subdomínio | Navegação de página de verdade (`window.location.href`) — `localStorage` é isolado por origem, então a sessão de super_admin em `admin.orrin.com.br` nunca é tocada |
| Como "sair" do modo impersonação | Faixa fixa no topo com link de volta pra `admin.orrin.com.br/admin` — a sessão original já está lá, intacta |
| Auditoria | Reusa `logAdminAction` (já existe) pra registrar quem impersonou qual clínica e quando |
| Escopo das rotas bloqueadas pra escrita | Todas as rotas de tenant (`pacientes`, `servicos`, `profissionais`, `agendamentos`, `atendimentos`, `configuracoes`, `whatsapp`, e as legadas `clientes`/`reunioes`/`injetaveis`/`marcacoes`) |

---

## Seção 1: Backend — `requireAuth` aceita impersonação

`backend/src/middleware/auth.ts`. O tipo do `req.user` ganha um campo:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string; impersonating?: boolean }
    }
  }
}
```

Dentro de `requireAuth`, trocar:

```ts
let payload: JWTPayload & { sub: string }
try {
  payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { sub: string }
} catch {
  return res.status(401).json({ error: 'Token inválido ou expirado' })
}

const { data: userData } = await supabaseAdmin
  .from('usuarios')
  .select('role, tenant_id')
  .eq('id', payload.sub)
  .single()

const user = {
  id: payload.sub,
  sub: payload.sub,
  email: payload.email,
  role: userData?.role || payload.role,
  tenant_id: userData?.tenant_id ?? payload.tenant_id,
}
```

por:

```ts
let payload: JWTPayload & { sub: string; impersonate_tenant_id?: string }
try {
  payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { sub: string; impersonate_tenant_id?: string }
} catch {
  return res.status(401).json({ error: 'Token inválido ou expirado' })
}

const { data: userData } = await supabaseAdmin
  .from('usuarios')
  .select('role, tenant_id')
  .eq('id', payload.sub)
  .single()

const realRole = userData?.role || payload.role
const realTenantId = userData?.tenant_id ?? payload.tenant_id
const impersonating = realRole === 'super_admin' && !!payload.impersonate_tenant_id

const user = {
  id: payload.sub,
  sub: payload.sub,
  email: payload.email,
  role: impersonating ? 'admin' : realRole,
  tenant_id: impersonating ? payload.impersonate_tenant_id! : realTenantId,
  impersonating,
}
```

**Nada mais nessa função muda.** O bloco que segue (`if (user.role === 'super_admin') { ...bypass... }`, depois a resolução de host/slug, a checagem `org.ativo`, e `org.id !== user.tenant_id`) já funciona corretamente pra esse `user` sintético, porque ele tem `role: 'admin'` e `tenant_id` real — exatamente como um admin de verdade da clínica.

### Novo middleware: bloquear escrita durante impersonação

No mesmo arquivo, exportar:

```ts
export function blockWritesWhenImpersonating(req: Request, res: Response, next: NextFunction) {
  if (req.user?.impersonating && req.method !== 'GET') {
    return res.status(403).json({ error: 'Modo somente leitura — você está visualizando como esta clínica.' })
  }
  next()
}
```

## Seção 2: Backend — `app.ts` aplica o bloqueio de escrita

`backend/src/app.ts`: importar `blockWritesWhenImpersonating` e inserir logo depois de `requireAuth` em toda rota de tenant:

```ts
import { requireAuth, requireTenant, requireSuperAdmin, blockWritesWhenImpersonating } from './middleware/auth'
...
app.use('/api/clientes', requireAuth, blockWritesWhenImpersonating, clientesRouter)
app.use('/api/reunioes', requireAuth, blockWritesWhenImpersonating, reunioesRouter)
app.use('/api/injetaveis', requireAuth, blockWritesWhenImpersonating, injetaveisRouter)
app.use('/api/marcacoes', requireAuth, blockWritesWhenImpersonating, marcacoesRouter)

app.use('/api/pacientes', requireAuth, blockWritesWhenImpersonating, requireTenant, pacientesRouter)
app.use('/api/servicos', requireAuth, blockWritesWhenImpersonating, requireTenant, servicosRouter)
app.use('/api/profissionais', requireAuth, blockWritesWhenImpersonating, requireTenant, profissionaisRouter)
app.use('/api/agendamentos', requireAuth, blockWritesWhenImpersonating, requireTenant, agendamentosRouter)
app.use('/api/atendimentos', requireAuth, blockWritesWhenImpersonating, requireTenant, atendimentosRouter)
app.use('/api/dashboard', requireAuth, blockWritesWhenImpersonating, dashboardRouter)
app.use('/api/whatsapp', requireAuth, blockWritesWhenImpersonating, whatsappRouter)
app.use('/api/configuracoes', requireAuth, blockWritesWhenImpersonating, configuracoesRouter)
```

`/api/admin` e as rotas públicas (`orgs`, `auth`, `webhook`) não mudam.

## Seção 3: Backend — rota de impersonar

`backend/src/routes/admin.ts`. Adicionar import `jwt` e a rota, depois de `POST /tenants/:id/cancel`:

```ts
import jwt from 'jsonwebtoken'
```

```ts
router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: org, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, slug, nome, ativo')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !org) {
    return res.status(404).json({ error: 'Clínica não encontrada' })
  }

  const token = jwt.sign(
    {
      sub: req.user!.id,
      email: req.user!.email,
      role: 'super_admin',
      tenant_id: null,
      impersonate_tenant_id: org.id,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  )

  await logAdminAction(req.user!.id, 'impersonate_org', org.id)

  res.json({
    token,
    org: { id: org.id, slug: org.slug, nome: org.nome },
  })
})
```

Sem checagem de `ativo` aqui de propósito — se a clínica estiver inativa, o token é emitido, mas a primeira request real já cai no `403 "Organização não disponível"` que já existe em `requireAuth`. O frontend evita esse caminho não mostrando o botão pra clínicas inativas (Seção 5).

## Seção 4: Frontend — `useAuth` guarda a clínica impersonada

`frontend/src/hooks/useAuth.ts`, reescrever:

```ts
import { create } from 'zustand'

interface ImpersonatingOrg {
  id: string
  slug: string
  nome: string
}

interface AuthState {
  token: string | null
  usuario: { id: string; email: string; role: string } | null
  impersonatingOrg: ImpersonatingOrg | null
  login: (token: string, usuario: AuthState['usuario'], impersonatingOrg?: ImpersonatingOrg | null) => void
  logout: () => void
}

const storedUsuario = localStorage.getItem('usuario')
const storedImpersonatingOrg = localStorage.getItem('impersonatingOrg')

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  usuario: storedUsuario ? JSON.parse(storedUsuario) : null,
  impersonatingOrg: storedImpersonatingOrg ? JSON.parse(storedImpersonatingOrg) : null,
  login: (token, usuario, impersonatingOrg = null) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    if (impersonatingOrg) {
      localStorage.setItem('impersonatingOrg', JSON.stringify(impersonatingOrg))
    } else {
      localStorage.removeItem('impersonatingOrg')
    }
    set({ token, usuario, impersonatingOrg })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    localStorage.removeItem('impersonatingOrg')
    set({ token: null, usuario: null, impersonatingOrg: null })
  },
}))
```

`Login.tsx` não muda (continua chamando `login(data.token, data.usuario)` — `impersonatingOrg` fica `null` por padrão, limpando qualquer impersonação anterior ao logar normal).

## Seção 5: Frontend — botão "Entrar como" no Admin

`frontend/src/pages/Admin.tsx`. Nova mutation, perto de `cancelar`:

```tsx
const { mutate: impersonar, isPending: impersonando } = useMutation({
  mutationFn: (id: string) => api.post(`/admin/tenants/${id}/impersonate`).then((r) => r.data),
  onSuccess: (data) => {
    const params = new URLSearchParams({
      token: data.token,
      org_id: data.org.id,
      org_slug: data.org.slug,
      org_nome: data.org.nome,
    })
    window.location.href = `https://${data.org.slug}.orrin.com.br/impersonar?${params}`
  },
})
```

No JSX, dentro do bloco `{t.ativo && (...)}` que já existe (onde está o botão de lixeira), adicionar antes da lixeira:

```tsx
<button
  onClick={() => impersonar(t.id)}
  disabled={impersonando}
  className="text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
>
  Entrar como
</button>
```

## Seção 6: Frontend — página `/impersonar` e faixa de aviso

Nova página `frontend/src/pages/Impersonar.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Impersonar() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    const orgId = params.get('org_id')
    const orgSlug = params.get('org_slug')
    const orgNome = params.get('org_nome')

    if (!token || !orgId || !orgSlug || !orgNome) {
      navigate('/login', { replace: true })
      return
    }

    login(token, { id: 'impersonating', email: '', role: 'admin' }, { id: orgId, slug: orgSlug, nome: orgNome })
    navigate('/dashboard', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Entrando...
    </div>
  )
}
```

`frontend/src/App.tsx`: importar e adicionar como rota pública (fora do `ProtectedRoute`, ao lado de `/login`):

```tsx
import { Impersonar } from './pages/Impersonar'
...
<Route path="/login" element={<Login />} />
<Route path="/impersonar" element={<Impersonar />} />
```

`frontend/src/components/AppShell.tsx`, adicionar a faixa de aviso:

```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '../hooks/useAuth'

export function AppShell() {
  const { impersonatingOrg } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {impersonatingOrg && (
          <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between shrink-0">
            <span>
              Visualizando <strong>{impersonatingOrg.nome}</strong> · somente leitura
            </span>
            <a href="https://admin.orrin.com.br/admin" className="underline font-medium">
              Voltar ao painel admin
            </a>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

## Seção 7: Testes (backend)

`backend/tests/admin.test.ts` (arquivo já existe — adicionar um novo `describe`):

- `POST /admin/tenants/:id/impersonate` como super_admin → `200`, `token` presente.
- Com esse token + `Host` do slug da clínica-alvo, `GET /api/pacientes` (ou outra rota de tenant) → `200` com dado real (não array vazio) — prova que o `tenant_id` da impersonação foi aplicado de verdade.
- Com o mesmo token, `POST /api/pacientes` → `403` (bloqueio de escrita).
- `POST /admin/tenants/:id/impersonate` com `id` inexistente → `404`.
- `POST /admin/tenants/:id/impersonate` como usuário não-super_admin → `403` (já garantido pelo `requireSuperAdmin` no `app.ts`, mas vale um teste de regressão).

## Fora de escopo

- Impersonar clínica inativa (cai no 403 já existente; botão nem aparece).
- Desabilitar/esconder botões de criar/editar no frontend durante impersonação — a proteção real é o 403 do backend; o frontend só mostraria uma mensagem de erro se alguém tentasse salvar algo. Pode ser um refinamento futuro.
- Expirar/invalidar o token de impersonação antes da 1h (ex: ao clicar "Voltar ao painel admin") — como o token nunca é salvo em `admin.orrin.com.br`, só existe na aba da clínica, deixá-lo expirar naturalmente em 1h é suficiente.

## Checklist Final

- [ ] `requireAuth` aceita `impersonate_tenant_id` só se o papel real no banco for `super_admin`
- [ ] `blockWritesWhenImpersonating` bloqueia tudo que não é GET
- [ ] Middleware aplicado em todas as rotas de tenant no `app.ts`
- [ ] `POST /admin/tenants/:id/impersonate` implementado e logado via `logAdminAction`
- [ ] `useAuth` guarda `impersonatingOrg`
- [ ] Botão "Entrar como" no Admin (só clínicas ativas)
- [ ] Página `/impersonar` + rota pública no `App.tsx`
- [ ] Faixa de aviso na `AppShell` com link de volta
- [ ] Testes novos em `admin.test.ts` passando
- [ ] Verificação manual: entrar como a "Clínica Teste", ver dado real, tentar escrever (bloqueado), voltar pro admin
