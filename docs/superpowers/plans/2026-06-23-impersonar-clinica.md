# Entrar Como (Impersonar Clínica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um `super_admin` "entre como" uma clínica específica pra ver os dados reais dela, em modo somente leitura.

**Architecture:** Token JWT de curta duração (1h) com a claim `impersonate_tenant_id`, validada pelo `requireAuth` contra o papel real do usuário no banco (nunca confia ciegamente no token) — todas as rotas e telas de clínica já existentes funcionam sem alteração, porque passam a receber um `req.user` com `role: 'admin'` e `tenant_id` real.

**Tech Stack:** Express + TypeScript + JWT (backend), React + Zustand + React Router (frontend), Vitest + Supertest (testes).

**Spec:** `docs/superpowers/specs/2026-06-23-impersonar-clinica-design.md`

---

## Task 1: Backend — `requireAuth` aceita impersonação

**Files:**
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Atualizar o tipo do `req.user`**

Trocar:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string }
    }
  }
}
```

por:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string; impersonating?: boolean }
    }
  }
}
```

- [ ] **Step 2: Aceitar a claim `impersonate_tenant_id` em `requireAuth`**

Trocar:

```ts
  // Verifica o JWT gerado pela rota /api/auth/login
  let payload: JWTPayload & { sub: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { sub: string }
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  // Busca role e tenant_id atualizados no banco
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
  // Verifica o JWT gerado pela rota /api/auth/login
  let payload: JWTPayload & { sub: string; impersonate_tenant_id?: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { sub: string; impersonate_tenant_id?: string }
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  // Busca role e tenant_id atualizados no banco
  const { data: userData } = await supabaseAdmin
    .from('usuarios')
    .select('role, tenant_id')
    .eq('id', payload.sub)
    .single()

  // A claim de impersonação só é honrada se o papel REAL (do banco) for super_admin —
  // nunca confia em payload.role pra essa decisão.
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

Nada mais na função muda — o bloco do bypass de `super_admin`, a resolução de host/slug, e as checagens de `org.ativo`/`org.id !== user.tenant_id` continuam exatamente como estão, e passam a funcionar corretamente pra esse `user` sintético.

- [ ] **Step 3: Adicionar o middleware `blockWritesWhenImpersonating`**

Adicionar depois da função `requireTenant`:

```ts
// Modo somente leitura: qualquer escrita durante impersonação é bloqueada.
export function blockWritesWhenImpersonating(req: Request, res: Response, next: NextFunction) {
  if (req.user?.impersonating && req.method !== 'GET') {
    return res.status(403).json({ error: 'Modo somente leitura — você está visualizando como esta clínica.' })
  }
  next()
}
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/middleware/auth.ts
git commit -m "feat: requireAuth aceita token de impersonacao + bloqueio de escrita"
```

---

## Task 2: Backend — aplicar o bloqueio de escrita em todas as rotas de tenant

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Importar o novo middleware**

Trocar:

```ts
import { requireAuth, requireTenant, requireSuperAdmin } from './middleware/auth'
```

por:

```ts
import { requireAuth, requireTenant, requireSuperAdmin, blockWritesWhenImpersonating } from './middleware/auth'
```

- [ ] **Step 2: Inserir o middleware em toda rota de tenant**

Trocar:

```ts
  // Rotas de tenant (requerem auth + tenant válido)
  app.use('/api/clientes', requireAuth, clientesRouter)
  app.use('/api/reunioes', requireAuth, reunioesRouter)
  app.use('/api/injetaveis', requireAuth, injetaveisRouter)
  app.use('/api/marcacoes', requireAuth, marcacoesRouter)

  // Rotas da clínica (super_admin sem tenant recebe [] para não dar 500)
  app.use('/api/pacientes', requireAuth, requireTenant, pacientesRouter)
  app.use('/api/servicos', requireAuth, requireTenant, servicosRouter)
  app.use('/api/profissionais', requireAuth, requireTenant, profissionaisRouter)
  app.use('/api/agendamentos', requireAuth, requireTenant, agendamentosRouter)
  app.use('/api/atendimentos', requireAuth, requireTenant, atendimentosRouter)
  app.use('/api/dashboard', requireAuth, dashboardRouter)
  app.use('/api/whatsapp', requireAuth, whatsappRouter)
  app.use('/api/configuracoes', requireAuth, configuracoesRouter)
```

por:

```ts
  // Rotas de tenant (requerem auth + tenant válido)
  app.use('/api/clientes', requireAuth, blockWritesWhenImpersonating, clientesRouter)
  app.use('/api/reunioes', requireAuth, blockWritesWhenImpersonating, reunioesRouter)
  app.use('/api/injetaveis', requireAuth, blockWritesWhenImpersonating, injetaveisRouter)
  app.use('/api/marcacoes', requireAuth, blockWritesWhenImpersonating, marcacoesRouter)

  // Rotas da clínica (super_admin sem tenant recebe [] para não dar 500)
  app.use('/api/pacientes', requireAuth, blockWritesWhenImpersonating, requireTenant, pacientesRouter)
  app.use('/api/servicos', requireAuth, blockWritesWhenImpersonating, requireTenant, servicosRouter)
  app.use('/api/profissionais', requireAuth, blockWritesWhenImpersonating, requireTenant, profissionaisRouter)
  app.use('/api/agendamentos', requireAuth, blockWritesWhenImpersonating, requireTenant, agendamentosRouter)
  app.use('/api/atendimentos', requireAuth, blockWritesWhenImpersonating, requireTenant, atendimentosRouter)
  app.use('/api/dashboard', requireAuth, blockWritesWhenImpersonating, dashboardRouter)
  app.use('/api/whatsapp', requireAuth, blockWritesWhenImpersonating, whatsappRouter)
  app.use('/api/configuracoes', requireAuth, blockWritesWhenImpersonating, configuracoesRouter)
```

`/api/admin` e as rotas públicas (`/api/orgs`, `/api/auth`, `/api/webhook`) não mudam.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte existente pra confirmar que nada quebrou**

Run: `cd backend && npx vitest run tests/profissionais.test.ts tests/admin.test.ts tests/auth.test.ts`
Expected: mesmos resultados de antes dessa mudança (os testes que já passavam continuam passando — `blockWritesWhenImpersonating` deixa passar direto quando `req.user.impersonating` é `undefined`, que é o caso de todo usuário normal).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/app.ts
git commit -m "feat: aplica bloqueio de escrita durante impersonacao nas rotas de tenant"
```

---

## Task 3: Backend — rota de impersonar + testes

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/tests/admin.test.ts`

- [ ] **Step 1: Escrever os testes (vão falhar — rota não existe ainda)**

Adicionar ao final de `backend/tests/admin.test.ts` (depois do `describe('POST /api/admin/tenants/:id/cancel', ...)` existente, sem alterar nada que já está no arquivo):

```ts
describe('POST /api/admin/tenants/:id/impersonate', () => {
  let impersonateOrgId: string
  let impersonateOrgSlug: string

  beforeAll(async () => {
    const slug = `clinica-impersonate-test-${Date.now()}`
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug, nome: 'Clínica Impersonate Test' })
      .select('id, slug')
      .single()
    impersonateOrgId = org!.id
    impersonateOrgSlug = org!.slug

    await supabase
      .from('profissionais')
      .insert({ nome: 'Profissional Impersonate', tenant_id: impersonateOrgId })
  })

  afterAll(async () => {
    await supabase.from('profissionais').delete().eq('tenant_id', impersonateOrgId)
    await supabase.from('organizacoes').delete().eq('id', impersonateOrgId)
  })

  it('retorna um token de impersonacao para super_admin', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.org.id).toBe(impersonateOrgId)
  })

  it('retorna 404 com id inexistente', async () => {
    const res = await request(app)
      .post('/api/admin/tenants/00000000-0000-0000-0000-000000000000/impersonate')
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(404)
  })

  it('o token de impersonacao acessa dados reais da clinica', async () => {
    const impersonateRes = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    const impersonateToken = impersonateRes.body.token

    const res = await request(app)
      .get('/api/profissionais')
      .set('Authorization', `Bearer ${impersonateToken}`)
      .set('Host', `${impersonateOrgSlug}.orrin.com.br`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].nome).toBe('Profissional Impersonate')
  })

  it('bloqueia escrita (POST) durante impersonacao', async () => {
    const impersonateRes = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    const impersonateToken = impersonateRes.body.token

    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${impersonateToken}`)
      .set('Host', `${impersonateOrgSlug}.orrin.com.br`)
      .send({ nome: 'Tentativa de escrita' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run tests/admin.test.ts -t "impersonate"`
Expected: FAIL — a primeira chamada recebe `404` (rota não existe ainda).

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/admin.ts`, adicionar o import no topo:

```ts
import jwt from 'jsonwebtoken'
```

Adicionar depois da rota `POST /tenants/:id/cancel` existente, antes de `export default router`:

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

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run tests/admin.test.ts -t "impersonate"`
Expected: PASS — 4 testes do novo `describe`.

- [ ] **Step 5: Rodar o arquivo inteiro pra confirmar que não regrediu nada**

Run: `cd backend && npx vitest run tests/admin.test.ts`
Expected: todos os testes (os de `cancel` já existentes + os 4 novos de `impersonate`) passam.

- [ ] **Step 6: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd backend && git add src/routes/admin.ts tests/admin.test.ts
git commit -m "feat: rota POST /admin/tenants/:id/impersonate"
```

---

## Task 4: Frontend — `useAuth` guarda a clínica impersonada

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Reescrever o arquivo**

Conteúdo completo novo de `frontend/src/hooks/useAuth.ts`:

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

`frontend/src/pages/Login.tsx` não precisa de nenhuma mudança — continua chamando `login(data.token, data.usuario)` com dois argumentos; `impersonatingOrg` fica `null` por padrão, o que corretamente limpa qualquer impersonação anterior ao fazer login normal.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/hooks/useAuth.ts
git commit -m "feat: useAuth guarda a clinica impersonada"
```

---

## Task 5: Frontend — botão "Entrar como" no Admin

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

- [ ] **Step 1: Adicionar a mutation de impersonar**

Trocar:

```tsx
  const { mutate: cancelar, isPending: cancelando } = useMutation({
    mutationFn: (id: string) => api.post(`/admin/tenants/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setConfirmandoId(null)
      setConfirmTexto('')
    },
  })
```

por:

```tsx
  const { mutate: cancelar, isPending: cancelando } = useMutation({
    mutationFn: (id: string) => api.post(`/admin/tenants/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setConfirmandoId(null)
      setConfirmTexto('')
    },
  })

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

- [ ] **Step 2: Adicionar o botão na linha de cada clínica ativa**

Trocar:

```tsx
                        {t.ativo && (
                          <button
                            onClick={() => { setConfirmandoId(t.id); setConfirmTexto('') }}
                            className="text-red-400 hover:text-red-600"
                            title="Cancelar clínica"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
```

por:

```tsx
                        {t.ativo && (
                          <>
                            <button
                              onClick={() => impersonar(t.id)}
                              disabled={impersonando}
                              className="text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                            >
                              Entrar como
                            </button>
                            <button
                              onClick={() => { setConfirmandoId(t.id); setConfirmTexto('') }}
                              className="text-red-400 hover:text-red-600"
                              title="Cancelar clínica"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/Admin.tsx
git commit -m "feat: botao Entrar como no painel Admin"
```

---

## Task 6: Frontend — página `/impersonar`

**Files:**
- Create: `frontend/src/pages/Impersonar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Criar a página**

Conteúdo completo de `frontend/src/pages/Impersonar.tsx`:

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

- [ ] **Step 2: Adicionar a rota pública**

Em `frontend/src/App.tsx`, adicionar o import:

```tsx
import { Impersonar } from './pages/Impersonar'
```

E trocar:

```tsx
        <Routes>
          <Route path="/login" element={<Login />} />
```

por:

```tsx
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/impersonar" element={<Impersonar />} />
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/Impersonar.tsx src/App.tsx
git commit -m "feat: pagina /impersonar para receber o handoff de sessao"
```

---

## Task 7: Frontend — faixa de aviso na AppShell

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Reescrever o arquivo**

Conteúdo completo novo de `frontend/src/components/AppShell.tsx`:

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

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/AppShell.tsx
git commit -m "feat: faixa de aviso durante impersonacao na AppShell"
```

---

## Task 8: Verificação manual de ponta a ponta

**Pré-requisito:** Tasks 1-7 commitadas, código já no ar (push + deploy — ver convenção já usada nesta sessão: backend no Render faz deploy automático, frontend na Vercel precisa promover manualmente o deploy mais recente pra Produção).

- [ ] **Step 1: No painel Admin (`admin.orrin.com.br/admin`), clicar em "Entrar como" numa clínica ativa**

Esperado: navega pra `https://<slug>.orrin.com.br/dashboard`, mostra a faixa amarela "Visualizando [Clínica] · somente leitura" no topo.

- [ ] **Step 2: Confirmar que os dados mostrados são reais**

Navegar pra Pacientes/Profissionais/Agenda — devem aparecer os dados de verdade daquela clínica (não vazios).

- [ ] **Step 3: Tentar uma ação de escrita**

Tentar criar um paciente, profissional, ou serviço — deve falhar (o backend devolve 403; a tela deve mostrar algum estado de erro, mesmo que não seja uma mensagem refinada — isso é aceitável, está documentado como fora de escopo no spec).

- [ ] **Step 4: Clicar em "Voltar ao painel admin"**

Esperado: volta pra `admin.orrin.com.br/admin`, ainda logado como super_admin (sessão original intacta, sem precisar logar de novo).

- [ ] **Step 5: Reportar resultado**

Se algo não funcionar como esperado, voltar pra task correspondente e corrigir antes de seguir.

---

## Checklist Final

- [ ] Task 1: `requireAuth` aceita impersonação + middleware de bloqueio de escrita
- [ ] Task 2: middleware aplicado em todas as rotas de tenant
- [ ] Task 3: rota de impersonar + testes passando
- [ ] Task 4: `useAuth` guarda `impersonatingOrg`
- [ ] Task 5: botão "Entrar como" no Admin
- [ ] Task 6: página `/impersonar` + rota pública
- [ ] Task 7: faixa de aviso na AppShell
- [ ] Task 8: verificado manualmente de ponta a ponta
