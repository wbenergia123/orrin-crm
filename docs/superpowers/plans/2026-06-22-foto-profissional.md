# Trocar Foto do Profissional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir trocar (e remover) a foto de um profissional na página Profissionais, com a foto aparecendo também no card da Agenda.

**Architecture:** Upload multipart → backend (`multer`) → Supabase Storage via `supabaseAdmin` (service role, sem RLS) → URL pública salva em `profissionais.foto_url`. Frontend: novo helper `lib/avatar.ts` compartilhado entre `Agenda.tsx` e `Profissionais.tsx`.

**Tech Stack:** Express + TypeScript + Supabase (backend), React + TanStack Query + Tailwind (frontend), Vitest + Supertest (testes backend).

**Spec:** `docs/superpowers/specs/2026-06-22-foto-profissional-design.md`

---

## Estado atual (Tasks 1-4 já feitas e comitadas nesta sessão)

Antes de escrever este plano, validei a Seção 0 do spec rodando a suite de testes real contra o Supabase do `.env` local. Isso revelou 3 problemas em camadas (cada um só aparecia depois do anterior corrigido) e já foram corrigidos e comitados:

| Commit | O que mudou |
|---|---|
| `a9e7afa` | Remove client Supabase anon morto (`SUPABASE_ANON_KEY` nunca definida) que quebrava o boot inteiro do backend via `agents/pedro.ts` |
| `99b5de1` | Extrai `createApp()` para `backend/src/app.ts` (testável sem `app.listen`) |
| `ce2348b` | Instala `vitest`, `supertest`, `@types/supertest`, `multer`, `@types/multer`; adiciona script `"test": "vitest run"` |
| `f4ac3f8` | `RoleUsuario` passa a incluir `'secretaria'` |
| `9489592` | Adiciona `supabase/migrations/009_fix_usuarios_role_check.sql` e `010_foto_profissional.sql` ao repo (aplicação no Supabase é manual — Task 5) |

Baseline atual confirmado com `npm test` em `backend/`: **26 failed, 4 passed, 19 skipped (49 total)**. As falhas restantes são, na maioria, `401`/`403` causados por dois problemas pré-existentes e **fora do escopo deste plano**:
- a constraint `usuarios_role_check` ainda rejeita `'secretaria'` no banco real até a Task 5 ser aplicada;
- a maioria dos testes pré-existentes nunca define um header `Host` que bata com uma organização real, então mesmo depois da Task 5 muitos continuarão falhando com `403 Organização não disponível` — confirmei isso testando manualmente com um usuário `admin` com `tenant_id` setado. Esse é um gap separado nos testes pré-existentes (não escrevem `.set('Host', ...)`), não introduzido por este trabalho, e não faz parte deste plano corrigi-lo.
- `claude-tools.test.ts` e `confirmacao.test.ts` importam um módulo que não existe (`../src/lib/claude-tools`) — feature separada (ferramentas do agente Claude), não relacionada.

As novas tasks de teste deste plano (Task 6) **não dependem dos testes pré-existentes passarem** — usam seu próprio usuário/organização/Host, isolados dos demais.

---

## Task 5: [AÇÃO MANUAL DO USUÁRIO] Aplicar as migrations no Supabase Studio

**Arquivos (já existem no repo, só leitura):**
- `supabase/migrations/009_fix_usuarios_role_check.sql`
- `supabase/migrations/010_foto_profissional.sql`

- [ ] **Passo único: colar e rodar no SQL Editor do Supabase Studio, na ordem**

```sql
-- 009
ALTER TABLE usuarios DROP CONSTRAINT usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'vendedor', 'secretaria', 'super_admin'));
```

```sql
-- 010
ALTER TABLE profissionais ADD COLUMN foto_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-profissionais', 'fotos-profissionais', true)
ON CONFLICT DO NOTHING;
```

**Esta task é um checkpoint bloqueante.** Quem estiver executando o plano (eu ou um subagente) deve parar aqui e confirmar com o usuário que as duas migrations foram aplicadas antes de iniciar a Task 6 — sem elas, os testes da Task 6 falham na criação do usuário de teste (`secretaria`) ou na atualização de `foto_url` (coluna não existe).

---

## Task 6: Backend — rotas de upload/remoção de foto

**Files:**
- Modify: `backend/src/routes/profissionais.ts`
- Test: `backend/tests/profissionais.test.ts`

- [ ] **Step 1: Escrever os testes (vão falhar — rota não existe ainda)**

Adicionar ao final de `backend/tests/profissionais.test.ts` (depois do último `describe` existente, sem alterar nada que já está no arquivo):

```ts
describe('Foto do profissional', () => {
  const email = 'sec_foto@clinica.com'
  let tokenFoto: string
  let hostTenant: string
  let fotoProfissionalId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .select('id, slug')
      .eq('ativo', true)
      .limit(1)
      .single()
    hostTenant = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').upsert(
      { email, senha_hash: hash, role: 'secretaria', tenant_id: org!.id },
      { onConflict: 'email' }
    )
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' })
    tokenFoto = loginRes.body.token

    const { data: prof } = await supabase
      .from('profissionais')
      .insert({ nome: 'Foto Teste', tenant_id: org!.id })
      .select()
      .single()
    fotoProfissionalId = prof!.id
  })

  afterAll(async () => {
    await supabase.from('profissionais').delete().eq('id', fotoProfissionalId)
  })

  it('envia uma foto e retorna foto_url preenchido', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(200)
    expect(res.body.foto_url).toContain('fotos-profissionais')
  })

  it('retorna 400 sem arquivo', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
    expect(res.status).toBe(400)
  })

  it('retorna 400 com mimetype inválido', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from('conteudo qualquer'), { filename: 'teste.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
  })

  it('retorna 404 com id inexistente', async () => {
    const res = await request(app)
      .post('/api/profissionais/00000000-0000-0000-0000-000000000000/foto')
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(404)
  })

  it('remove a foto e volta foto_url para null', async () => {
    const res = await request(app)
      .delete(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
    expect(res.status).toBe(200)
    expect(res.body.foto_url).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run tests/profissionais.test.ts -t "Foto do profissional"`
Expected: FAIL — primeiro teste recebe `404` (rota não existe), não `200`.

- [ ] **Step 3: Implementar as rotas**

No topo de `backend/src/routes/profissionais.ts`, adicionar o import:

```ts
import multer from 'multer'
```

Adicionar antes de `export default router`, depois da rota `DELETE /:id` existente:

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

router.post('/:id/foto', (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 5MB)' : 'Erro no upload'
      res.status(400).json({ error: msg })
      return
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo "foto" é obrigatório' }); return }
  if (!TIPOS_ACEITOS.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    return
  }

  const { data: existente } = await supabaseAdmin
    .from('profissionais')
    .select('id')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (!existente) { res.status(404).json({ error: 'Profissional não encontrado' }); return }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/${req.params.id}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-profissionais')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('fotos-profissionais').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update({ foto_url: publicUrl })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id/foto', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update({ foto_url: null })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run tests/profissionais.test.ts -t "Foto do profissional"`
Expected: PASS — 5 testes do novo `describe` (os outros 6 testes pré-existentes no mesmo arquivo podem continuar falhando por `403`, conforme nota na seção "Estado atual" — não é regressão deste trabalho).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/routes/profissionais.ts tests/profissionais.test.ts
git commit -m "feat: upload e remoção de foto do profissional"
```

---

## Task 7: Frontend — tipo `Profissional` e helper de avatar

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/avatar.ts`

- [ ] **Step 1: Adicionar `foto_url` ao tipo**

Em `frontend/src/types/index.ts`, trocar:

```ts
export interface Profissional {
  id: string
  nome: string
  ativo: boolean
}
```

por:

```ts
export interface Profissional {
  id: string
  nome: string
  ativo: boolean
  foto_url: string | null
}
```

- [ ] **Step 2: Criar `frontend/src/lib/avatar.ts`**

```ts
const GRADIENT_COLORS = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#0891b2', '#be185d', '#4f46e5']

function corPorNome(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return GRADIENT_COLORS[Math.abs(h) % GRADIENT_COLORS.length]
}

export function getAvatarUrl(p: { id: string; nome: string; foto_url: string | null }): string {
  if (p.foto_url) return p.foto_url
  return `https://i.pravatar.cc/80?u=${p.id}`
}

export function getAvatarFallback(nome: string): string {
  const cor = corPorNome(nome)
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=${cor.replace('#', '')}&color=fff&size=80&bold=true&rounded=true`
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros novos (o tipo `Profissional` ganhou um campo obrigatório — a Task 8 atualiza o único outro lugar que constrói esse objeto, o card da Agenda já lê de uma API que vai passar a retornar `foto_url`).

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/types/index.ts src/lib/avatar.ts
git commit -m "feat: campo foto_url em Profissional + helper de avatar compartilhado"
```

---

## Task 8: Frontend — `Agenda.tsx` usa o helper de avatar

**Files:**
- Modify: `frontend/src/pages/Agenda.tsx:1-105`

- [ ] **Step 1: Remover a lógica de cor/avatar inline e usar o helper**

Remover de `frontend/src/pages/Agenda.tsx` (linhas 48-54 na versão atual):

```ts
const GRADIENT_COLORS = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#0891b2', '#be185d', '#4f46e5']

function profissionalColor(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return GRADIENT_COLORS[Math.abs(h) % GRADIENT_COLORS.length]
}
```

Adicionar no topo do arquivo, junto aos outros imports:

```ts
import { getAvatarUrl, getAvatarFallback } from '../lib/avatar'
```

Dentro de `CardProfissional`, trocar:

```ts
  const cor = profissionalColor(profissional.nome)
  const fallbackSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(profissional.nome)}&background=${cor.replace('#', '')}&color=fff&size=80&bold=true&rounded=true`
  // pravatar.cc returns consistent real person photos seeded by the professional's id
  const avatarSrc = `https://i.pravatar.cc/80?u=${profissional.id}`
```

por (sem código de cor/fallback local — vem do helper):

```ts
  const avatarSrc = getAvatarUrl(profissional)
  const fallbackSrc = getAvatarFallback(profissional.nome)
```

O JSX do `<img>` (`src={avatarSrc}` / `onError={(e) => { e.currentTarget.src = fallbackSrc }}`) não muda.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/Agenda.tsx
git commit -m "refactor: Agenda usa helper de avatar compartilhado"
```

---

## Task 9: Frontend — UI de troca/remoção de foto em `Profissionais.tsx`

**Files:**
- Modify: `frontend/src/pages/Profissionais.tsx`

- [ ] **Step 1: Adicionar imports**

No topo do arquivo, trocar:

```ts
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
```

por:

```ts
import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Camera } from 'lucide-react'
import { getAvatarUrl, getAvatarFallback } from '../lib/avatar'
```

- [ ] **Step 2: Criar o componente `FotoProfissional`**

Adicionar antes de `function ProfissionalDialog`:

```tsx
function FotoProfissional({ profissional }: { profissional: Profissional }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  const { mutate: enviarFoto, isPending: enviando } = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('foto', file)
      return api.post(`/profissionais/${profissional.id}/foto`, form)
    },
    onSuccess: () => {
      setErro(null)
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
    },
    onError: () => setErro('Não foi possível enviar a foto. Tente novamente.'),
  })

  const { mutate: removerFoto, isPending: removendo } = useMutation({
    mutationFn: () => api.delete(`/profissionais/${profissional.id}/foto`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setErro('Arquivo muito grande (máx. 5MB)')
      return
    }
    enviarFoto(file)
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-2">
      <div className="relative">
        <img
          src={getAvatarUrl(profissional)}
          onError={(e) => { e.currentTarget.src = getAvatarFallback(profissional.nome) }}
          alt={profissional.nome}
          className="w-20 h-20 rounded-full object-cover border border-gray-100"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="absolute -bottom-1 -right-1 bg-violet-600 text-white rounded-full p-1.5 hover:bg-violet-700 disabled:opacity-50"
          title="Trocar foto"
        >
          <Camera size={14} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {profissional.foto_url && (
        <button
          type="button"
          onClick={() => removerFoto()}
          disabled={removendo}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Remover foto
        </button>
      )}
      {erro && <p className="text-xs text-red-500">{erro}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Renderizar dentro de `ProfissionalDialog`, só em modo edição**

Dentro de `ProfissionalDialog`, trocar:

```tsx
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Nome do profissional</Label>
```

por:

```tsx
  return (
    <div className="space-y-4 pt-2">
      {profissional && <FotoProfissional profissional={profissional} />}
      <div className="space-y-1">
        <Label>Nome do profissional</Label>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/pages/Profissionais.tsx
git commit -m "feat: UI de trocar/remover foto no diálogo de editar profissional"
```

---

## Task 10: Verificação manual no browser

**Pré-requisito:** Task 5 (migrations aplicadas) e backend rodando com as variáveis do `.env` carregadas.

- [ ] **Step 1: Rodar backend e frontend localmente**

Run: `cd backend && npm run dev` (terminal 1)
Run: `cd frontend && npm run dev` (terminal 2)

- [ ] **Step 2: Testar o fluxo completo**

1. Logar na aplicação.
2. Ir em Profissionais → editar um profissional existente.
3. Confirmar que aparece o avatar atual (gerado) com o ícone de câmera.
4. Clicar no ícone, escolher uma imagem (jpg/png/webp) — confirmar que a foto troca no diálogo.
5. Ir em Agenda — confirmar que o card desse profissional já mostra a foto nova, sem precisar recarregar a página.
6. Voltar em Profissionais → editar o mesmo profissional → clicar "Remover foto" — confirmar que volta ao avatar gerado, e que a Agenda reflete isso também.
7. Tentar enviar um arquivo não-imagem (ex.: `.pdf` renomeado) ou maior que 5MB — confirmar que aparece a mensagem de erro e nada quebra.

- [ ] **Step 3: Reportar resultado**

Caso algo não funcione como esperado, **não** marcar esta task como concluída — voltar para a task correspondente (6, 7, 8 ou 9) e corrigir antes de seguir.

---

## Checklist Final

- [x] Task 1-4: infra de testes corrigida (já comitado: `a9e7afa`, `99b5de1`, `ce2348b`, `f4ac3f8`, `9489592`)
- [ ] Task 5: migrations aplicadas no Supabase Studio (ação do usuário)
- [ ] Task 6: rotas de foto + testes passando
- [ ] Task 7: tipo + helper de avatar
- [ ] Task 8: Agenda usando o helper
- [ ] Task 9: UI de upload/remoção em Profissionais
- [ ] Task 10: verificação manual no browser
