# Melhorias na Marcação Digital — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a Marcação Digital realmente utilizável: corrigir um bug de banco que impede qualquer marcação/sessão/foto de ser salva, adicionar uma lista de produtos para marcação rápida, uma aba de histórico por sessão, e upload real de fotos antes/depois ligadas à sessão.

**Architecture:** Correção de schema (FK quebrada) como pré-requisito, depois 3 melhorias incrementais na tela existente de Marcação Digital (`frontend/src/components/marcacao/`) e na ficha do paciente (`frontend/src/pages/FichaPaciente.tsx`), reaproveitando rotas de backend já existentes onde possível.

**Tech Stack:** Express + Supabase (Postgres) no backend, React + TanStack Query no frontend, multer para upload de arquivos, vitest + supertest para testes de backend (testes reais contra o Supabase do `.env`, sem mocks).

---

## Contexto importante antes de começar

Foi confirmado, testando direto contra o banco real, que as tabelas `atendimentos`, `fotos_paciente` e `injection_markings` têm uma chave estrangeira (`paciente_id`) apontando pra uma tabela antiga e vazia chamada `clientes` (de um projeto B2B anterior), em vez da tabela `pacientes` que o sistema usa hoje. Isso faz com que **toda tentativa de criar uma sessão, marcação ou foto falhe silenciosamente** — confirmado que a tabela `atendimentos` tem zero linhas em produção. A Tarefa 1 corrige isso antes de qualquer outra coisa.

Como não há acesso de CLI/DB direto neste ambiente, toda migration SQL deste plano precisa ser copiada e executada manualmente pelo usuário no SQL Editor do Supabase Studio — sigra o mesmo padrão já usado nas migrations anteriores desta sessão.

---

### Task 1: Corrigir a chave estrangeira `paciente_id` (pré-requisito)

**Files:**
- Create: `supabase/migrations/015_fix_paciente_fk.sql`
- Create: `backend/tests/marcacoes.test.ts`

- [ ] **Step 1: Escrever o teste que prova o bug**

Crie `backend/tests/marcacoes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

describe('Marcação Digital', () => {
  const email = 'sec_marcacao@clinica.com'
  let token: string
  let hostTenant: string
  let tenantId: string
  let pacienteId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .select('id, slug')
      .eq('ativo', true)
      .limit(1)
      .single()
    tenantId = org!.id
    hostTenant = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').upsert(
      { email, senha_hash: hash, role: 'secretaria', tenant_id: tenantId },
      { onConflict: 'email' }
    )
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' })
    token = loginRes.body.token

    const { data: paciente } = await supabase
      .from('pacientes')
      .insert({ tenant_id: tenantId, telefone: `551199${Date.now()}`, nome: 'Paciente Marcação Teste', status: 'novo' })
      .select('id')
      .single()
    pacienteId = paciente!.id
  })

  afterAll(async () => {
    await supabase.from('atendimentos').delete().eq('paciente_id', pacienteId)
    await supabase.from('pacientes').delete().eq('id', pacienteId)
  })

  describe('POST /api/marcacoes/atendimentos', () => {
    it('cria uma sessão para um paciente real', async () => {
      const res = await request(app)
        .post('/api/marcacoes/atendimentos')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .send({ paciente_id: pacienteId })
      expect(res.status).toBe(201)
      expect(res.body.paciente_id).toBe(pacienteId)
    })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha pelo motivo certo**

Run: `cd backend && npx vitest run tests/marcacoes.test.ts`
Expected: FAIL, status 400 em vez de 201, com mensagem contendo `atendimentos_paciente_id_fkey` (a violação de chave estrangeira) no corpo da resposta.

- [ ] **Step 3: Criar a migration de correção**

Crie `supabase/migrations/015_fix_paciente_fk.sql`:

```sql
-- As tabelas de Marcação Digital foram criadas (migrations 004/005) antes da
-- tabela "pacientes" existir, e ficaram apontando pra "clientes" — tabela
-- antiga do projeto B2B anterior, hoje vazia. Isso bloqueia silenciosamente
-- toda a feature: nenhuma sessão, marcação ou foto consegue ser salva.

ALTER TABLE atendimentos DROP CONSTRAINT atendimentos_paciente_id_fkey;
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE fotos_paciente DROP CONSTRAINT fotos_paciente_paciente_id_fkey;
ALTER TABLE fotos_paciente ADD CONSTRAINT fotos_paciente_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE injection_markings DROP CONSTRAINT injection_markings_paciente_id_fkey;
ALTER TABLE injection_markings ADD CONSTRAINT injection_markings_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;
```

- [ ] **Step 4: Pedir para o usuário aplicar a migration no Supabase Studio**

Mostre o SQL acima e peça para colar no SQL Editor do Supabase Studio do projeto. Aguarde confirmação antes de continuar.

- [ ] **Step 5: Rodar o teste de novo e confirmar que passa**

Run: `cd backend && npx vitest run tests/marcacoes.test.ts`
Expected: PASS — `1 passed (1)`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/015_fix_paciente_fk.sql backend/tests/marcacoes.test.ts
git commit -m "fix: corrige FK de paciente_id (apontava pra tabela clientes antiga, vazia)"
```

---

### Task 2: Coluna `visit_id` em `fotos_paciente`

**Files:**
- Create: `supabase/migrations/016_foto_paciente_visit.sql`
- Modify: `backend/src/types/index.ts:190-198`
- Modify: `frontend/src/types/index.ts:106-114`

- [ ] **Step 1: Criar a migration**

Crie `supabase/migrations/016_foto_paciente_visit.sql`:

```sql
ALTER TABLE fotos_paciente ADD COLUMN visit_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL;
CREATE INDEX idx_fotos_paciente_visit ON fotos_paciente(visit_id);
```

- [ ] **Step 2: Pedir para o usuário aplicar a migration no Supabase Studio**

Mostre o SQL acima e aguarde confirmação.

- [ ] **Step 3: Atualizar o tipo no backend**

Em `backend/src/types/index.ts`, troque:

```ts
export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  created_at: string
}
```

por:

```ts
export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  visit_id: string | null
  created_at: string
}
```

- [ ] **Step 4: Atualizar o tipo no frontend**

Em `frontend/src/types/index.ts`, troque:

```ts
export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  created_at: string
}
```

por:

```ts
export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  visit_id: string | null
  created_at: string
}
```

- [ ] **Step 5: Verificar que o typecheck passa**

Run: `cd backend && npm run typecheck && cd ../frontend && npx tsc --noEmit`
Expected: sem erros (o campo novo é opcional de usar, não quebra nada que já existia).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/016_foto_paciente_visit.sql backend/src/types/index.ts frontend/src/types/index.ts
git commit -m "feat: adiciona visit_id em fotos_paciente (liga foto à sessão)"
```

---

### Task 3: Rota de upload de foto (`POST /marcacoes/fotos/upload`)

**Files:**
- Modify: `backend/src/routes/marcacoes.ts:1-4` (import), `:167-188` (rota antiga)
- Modify: `backend/tests/marcacoes.test.ts` (criado na Task 1)

- [ ] **Step 1: Escrever os testes (vão falhar — a rota nova ainda não existe)**

Adicione ao final do `describe('Marcação Digital', ...)` em `backend/tests/marcacoes.test.ts`, depois do bloco `describe('POST /api/marcacoes/atendimentos', ...)` já existente:

```ts
  describe('POST /api/marcacoes/fotos/upload', () => {
    let visitId: string

    beforeAll(async () => {
      const { data: visit } = await supabase
        .from('atendimentos')
        .insert({ tenant_id: tenantId, paciente_id: pacienteId })
        .select('id')
        .single()
      visitId = visit!.id
    })

    afterAll(async () => {
      await supabase.from('fotos_paciente').delete().eq('paciente_id', pacienteId)
    })

    it('envia uma foto e retorna visit_id e tipo preenchidos', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .field('tipo', 'antes')
        .field('visit_id', visitId)
        .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
      expect(res.body.visit_id).toBe(visitId)
      expect(res.body.tipo).toBe('antes')
      expect(res.body.url).toContain('fotos-pacientes')
    })

    it('envia uma foto sem visit_id (foto solta, sem sessão)', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
      expect(res.body.visit_id).toBeNull()
      expect(res.body.tipo).toBe('geral')
    })

    it('retorna 400 sem arquivo', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
      expect(res.status).toBe(400)
    })

    it('retorna 400 com mimetype inválido', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .attach('foto', Buffer.from('texto qualquer'), { filename: 'teste.txt', contentType: 'text/plain' })
      expect(res.status).toBe(400)
    })
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx vitest run tests/marcacoes.test.ts`
Expected: FAIL nos 4 testes novos com `404` (rota `/fotos/upload` não existe ainda).

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/marcacoes.ts`, adicione o import no topo do arquivo:

```ts
import multer from 'multer'
```

Substitua o bloco da rota antiga (de `// Registrar foto (URL já uploadada no storage)` até o fechamento do `router.post('/fotos', ...)`) por:

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

// Anexar foto (upload real, multipart)
router.post('/fotos/upload', (req: Request, res: Response, next) => {
  upload.single('foto')(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 5MB)' : 'Erro no upload'
      res.status(400).json({ error: msg })
      return
    }
    next()
  })
}, async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo "foto" é obrigatório' }); return }
  if (!TIPOS_ACEITOS.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    return
  }

  const { paciente_id, tipo, legenda, visit_id } = req.body
  if (!paciente_id) { res.status(400).json({ error: 'paciente_id é obrigatório' }); return }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/${paciente_id}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-pacientes')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('fotos-pacientes').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('fotos_paciente')
    .insert({
      paciente_id,
      url: publicUrl,
      tipo: tipo || 'geral',
      legenda: legenda || null,
      visit_id: visit_id || null,
      tenant_id: req.user!.tenant_id,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})
```

Note: `req.body.visit_id` chega como string vazia `''` quando o campo não é enviado pelo `FormData` do frontend (não `undefined`) — `visit_id || null` já trata isso corretamente (string vazia é falsy).

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd backend && npx vitest run tests/marcacoes.test.ts`
Expected: PASS — `5 passed (5)` (1 da Task 1 + 4 novos).

- [ ] **Step 5: Confirmar que o bucket `fotos-pacientes` existe no Supabase**

Esse bucket já foi criado na migration `004_estetica_base.sql` (`INSERT INTO storage.buckets ...`). Se os testes do Step 4 passarem, o bucket já está correto — nenhuma ação extra necessária.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/marcacoes.ts backend/tests/marcacoes.test.ts
git commit -m "feat: rota de upload real de foto do paciente (substitui rota não usada que só aceitava URL)"
```

---

### Task 4: `MarkingEditor` aceita produto travado (`lockedProduct`)

**Files:**
- Modify: `frontend/src/components/marcacao/MarkingEditor.tsx`

- [ ] **Step 1: Adicionar o prop `lockedProduct` e ajustar o estado inicial**

Em `frontend/src/components/marcacao/MarkingEditor.tsx`, troque a interface e a inicialização de estado:

```tsx
interface MarkingEditorProps {
  x: number
  y: number
  injetaveis: Injetavel[]
  onSave: (data: { product_id: string; quantity: number; unit: string; lot_id?: string }) => void
  onCancel: () => void
  initial?: { product_id?: string; quantity?: number; unit?: string; lot_id?: string }
  lockedProduct?: Injetavel
}

export function MarkingEditor({ x, y, injetaveis, onSave, onCancel, initial, lockedProduct }: MarkingEditorProps) {
  const [product_id, setProductId] = useState(lockedProduct?.id ?? initial?.product_id ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '')
  const [lot_id, setLotId] = useState(initial?.lot_id ?? '')
  const ref = useRef<HTMLDivElement>(null)

  const selectedProduct = lockedProduct ?? injetaveis.find((p) => p.id === product_id)
```

- [ ] **Step 2: Tornar o campo de produto condicional**

Troque o bloco do campo "Produto" (o `<div>` que contém o `<label>Produto *</label>` e o `<select>`) por:

```tsx
        {lockedProduct ? (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lockedProduct.cor_hex }} />
            <span className="text-sm font-medium text-amber-800">{lockedProduct.nome}</span>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Produto *</label>
            <select
              value={product_id}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              required
            >
              <option value="">Selecionar...</option>
              {injetaveis.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.nome} ({p.categoria})</option>
              ))}
            </select>
          </div>
        )}
```

- [ ] **Step 3: Esconder o campo de Lote e focar a quantidade quando travado**

Troque o `<input>` de quantidade para receber `autoFocus={!!lockedProduct}`:

```tsx
          <input
            type="number"
            step="0.1"
            min="0"
            autoFocus={!!lockedProduct}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            required
          />
```

Envolva o bloco do campo "Lote" (o `<div>` com `<label>Lote (opcional)</label>`) numa condição — troque:

```tsx
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lote (opcional)</label>
          <input
            type="text"
            value={lot_id}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Ex: LOT-2026-001"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>
```

por:

```tsx
        {!lockedProduct && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lote (opcional)</label>
            <input
              type="text"
              value={lot_id}
              onChange={(e) => setLotId(e.target.value)}
              placeholder="Ex: LOT-2026-001"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        )}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/marcacao/MarkingEditor.tsx
git commit -m "feat: MarkingEditor aceita produto travado (lockedProduct) pra marcação rápida"
```

---

### Task 5: Componente `ProductSidebar`

**Files:**
- Create: `frontend/src/components/marcacao/ProductSidebar.tsx`

- [ ] **Step 1: Criar o componente**

Crie `frontend/src/components/marcacao/ProductSidebar.tsx`:

```tsx
// frontend/src/components/marcacao/ProductSidebar.tsx
import type { Injetavel } from '../../types'
import { CATEGORIA_LABELS } from './MarkingList'

interface ProductSidebarProps {
  injetaveis: Injetavel[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ProductSidebar({ injetaveis, selectedId, onSelect }: ProductSidebarProps) {
  const ativos = injetaveis.filter((p) => p.ativo)
  const grouped = ativos.reduce<Record<string, Injetavel[]>>((acc, p) => {
    if (!acc[p.categoria]) acc[p.categoria] = []
    acc[p.categoria].push(p)
    return acc
  }, {})

  if (ativos.length === 0) return null

  return (
    <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
      <h3 className="text-sm font-semibold text-gray-800">Produtos</h3>
      {Object.entries(grouped).map(([categoria, items]) => (
        <div key={categoria}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            {CATEGORIA_LABELS[categoria] ?? categoria}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((p) => {
              const isSelected = selectedId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(isSelected ? null : p.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.cor_hex }} />
                  {p.nome}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

`CATEGORIA_LABELS` já é exportado por `MarkingList.tsx` (`export { CATEGORIA_LABELS, VIEW_LABELS }` na última linha do arquivo).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/marcacao/ProductSidebar.tsx
git commit -m "feat: componente ProductSidebar (lista de produtos clicável, agrupada por categoria)"
```

---

### Task 6: Upload de foto no `BeforeAfterSlider`

**Files:**
- Modify: `frontend/src/components/marcacao/BeforeAfterSlider.tsx`

- [ ] **Step 1: Adicionar imports, novos props e o sub-componente de upload**

No topo do arquivo, troque o import de ícones:

```tsx
import { useState, useRef, useCallback } from 'react'
import { ImageOff, Camera, Loader2 } from 'lucide-react'
import type { FotoPaciente } from '../../types'
```

Troque a interface de props:

```tsx
interface BeforeAfterSliderProps {
  fotos: FotoPaciente[]
  antesId?: string
  depoisId?: string
  onSetAntes?: (id: string) => void
  onSetDepois?: (id: string) => void
  onUpload: (file: File, tipo: 'antes' | 'depois' | 'geral') => void
  isUploading: boolean
}
```

Adicione, depois da assinatura da função `BeforeAfterSlider` (antes do primeiro `return`), o sub-componente local:

```tsx
function UploadFoto({ onUpload, isUploading }: { onUpload: BeforeAfterSliderProps['onUpload']; isUploading: boolean }) {
  const [tipo, setTipo] = useState<'antes' | 'depois' | 'geral'>('geral')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2 mb-4">
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as 'antes' | 'depois' | 'geral')}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
      >
        <option value="antes">Antes</option>
        <option value="depois">Depois</option>
        <option value="geral">Geral</option>
      </select>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file, tipo)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-1.5 text-xs text-white bg-amber-500 rounded-lg px-3 py-1.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        Adicionar foto
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Atualizar a assinatura de `BeforeAfterSlider` e renderizar o upload**

Troque a linha da assinatura da função:

```tsx
export function BeforeAfterSlider({ fotos, antesId, depoisId, onSetAntes, onSetDepois }: BeforeAfterSliderProps) {
```

por:

```tsx
export function BeforeAfterSlider({ fotos, antesId, depoisId, onSetAntes, onSetDepois, onUpload, isUploading }: BeforeAfterSliderProps) {
```

Logo depois da linha `<h3 className="text-sm font-semibold text-gray-800 mb-4">Comparador Antes / Depois</h3>` — ela aparece **duas vezes** no arquivo (uma no branch "sem fotos selecionadas", outra no branch "com slider ativo") — adicione `<UploadFoto onUpload={onUpload} isUploading={isUploading} />` imediatamente abaixo de cada uma das duas ocorrências.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: vai falhar aqui porque `MarcacaoDigital.tsx` ainda não passa `onUpload`/`isUploading` — confirme que o único erro é exatamente esse (`Property 'onUpload' is missing...` no uso de `<BeforeAfterSlider>` dentro de `MarcacaoDigital.tsx`). Isso é esperado e será resolvido na Task 7.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/marcacao/BeforeAfterSlider.tsx
git commit -m "feat: upload de foto no comparador Antes/Depois"
```

---

### Task 7: Conectar tudo em `MarcacaoDigital.tsx`

**Files:**
- Modify: `frontend/src/components/marcacao/MarcacaoDigital.tsx`

- [ ] **Step 1: Imports e novo estado**

No topo do arquivo, adicione o import do novo componente:

```tsx
import { ProductSidebar } from './ProductSidebar'
```

Adicione, junto aos outros `useState` já existentes (depois de `const [depoisId, setDepoisId] = useState<string | undefined>()`):

```tsx
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
```

- [ ] **Step 2: Extrair `ensureVisit` e usá-lo em `handleSaveMarking`**

Adicione, depois das mutations já existentes (`saveProtocolo`) e antes do bloco `// ── Handlers ──`:

```tsx
  const ensureVisit = useCallback(async (): Promise<string> => {
    if (currentVisitId) return currentVisitId
    const resp = await api.post('/marcacoes/atendimentos', { paciente_id: pacienteId })
    queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
    return resp.data.id
  }, [currentVisitId, pacienteId, queryClient])
```

Troque o corpo de `handleSaveMarking` (de `let visitId = currentVisitId` até `setPendingPos(null)`) por:

```tsx
  const handleSaveMarking = useCallback(
    async (data: { product_id: string; quantity: number; unit: string; lot_id?: string }) => {
      let visitId: string
      try {
        visitId = await ensureVisit()
      } catch (e) {
        console.error('Erro ao criar atendimento:', e)
        return
      }
      addMarking.mutate({
        visit_id: visitId,
        paciente_id: pacienteId,
        view_type: viewType,
        x: pendingPos!.x,
        y: pendingPos!.y,
        ...data,
      })
      setPendingPos(null)
    },
    [ensureVisit, pacienteId, viewType, pendingPos, addMarking]
  )
```

- [ ] **Step 3: Adicionar a mutation de upload**

Adicione, depois de `handleViewChange` e antes do comentário `// Marcações para exibir no mapa atual`:

```tsx
  const uploadFoto = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: 'antes' | 'depois' | 'geral' }) => {
      const visitId = await ensureVisit()
      const form = new FormData()
      form.append('foto', file)
      form.append('paciente_id', pacienteId)
      form.append('tipo', tipo)
      form.append('visit_id', visitId)
      return (await api.post('/marcacoes/fotos/upload', form)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fotos', pacienteId] })
    },
  })
```

- [ ] **Step 4: Renderizar o `ProductSidebar` e passar `lockedProduct`**

Na coluna lateral, dentro do `<div className="bg-white rounded-xl border border-gray-100 p-4">` que contém "Marcações da sessão", adicione `<ProductSidebar injetaveis={injetaveis} selectedId={selectedProductId} onSelect={setSelectedProductId} />` imediatamente antes do `<div className="flex items-center justify-between mb-3">` que tem o título "Marcações da sessão".

No `<MarkingEditor>` já renderizado dentro do popover do mapa, adicione a prop:

```tsx
            {pendingPos && (
              <MarkingEditor
                x={pendingPos.x}
                y={pendingPos.y}
                injetaveis={injetaveis}
                onSave={handleSaveMarking}
                onCancel={() => setPendingPos(null)}
                lockedProduct={selectedProductId ? injetaveis.find((p) => p.id === selectedProductId) : undefined}
              />
            )}
```

- [ ] **Step 5: Passar `onUpload`/`isUploading` para `BeforeAfterSlider`**

Troque:

```tsx
      <BeforeAfterSlider
        fotos={fotos}
        antesId={antesId}
        depoisId={depoisId}
        onSetAntes={setAntesId}
        onSetDepois={setDepoisId}
      />
```

por:

```tsx
      <BeforeAfterSlider
        fotos={fotos}
        antesId={antesId}
        depoisId={depoisId}
        onSetAntes={setAntesId}
        onSetDepois={setDepoisId}
        onUpload={(file, tipo) => uploadFoto.mutate({ file, tipo })}
        isUploading={uploadFoto.isPending}
      />
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Verificação manual no browser**

Suba o frontend (`npm run dev`) e o backend, abra a ficha de um paciente real, vá em Marcação Digital:

1. Clique num produto na lista lateral nova — ele fica destacado.
2. Clique 2-3 vezes no mapa — confirme que abre só o popup de quantidade (sem dropdown, sem lote), e que o produto continua destacado/armado entre os cliques.
3. Clique no produto destacado de novo (desarma) e clique no mapa — confirme que abre o popup completo de antes (dropdown + quantidade + lote).
4. No Comparador Antes/Depois, clique "Adicionar foto", escolha tipo "Antes", envie uma imagem — confirme que aparece no seletor de fotos.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/marcacao/MarcacaoDigital.tsx
git commit -m "feat: conecta lista de produtos e upload de foto na tela de Marcação Digital"
```

---

### Task 8: Componente `HistoricoMarcacoes`

**Files:**
- Create: `frontend/src/components/marcacao/HistoricoMarcacoes.tsx`

- [ ] **Step 1: Criar o componente**

Crie `frontend/src/components/marcacao/HistoricoMarcacoes.tsx`:

```tsx
// frontend/src/components/marcacao/HistoricoMarcacoes.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Atendimento, InjectionMarking, FotoPaciente } from '../../types'
import { MarkingList } from './MarkingList'

interface HistoricoMarcacoesProps {
  pacienteId: string
}

export function HistoricoMarcacoes({ pacienteId }: HistoricoMarcacoesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: atendimentos = [] } = useQuery<Atendimento[]>({
    queryKey: ['atendimentos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/atendimentos/${pacienteId}`)).data,
  })

  const { data: todasMarcacoes = [] } = useQuery<InjectionMarking[]>({
    queryKey: ['all-markings', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/paciente/${pacienteId}`)).data,
  })

  const { data: fotos = [] } = useQuery<FotoPaciente[]>({
    queryKey: ['fotos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/fotos/${pacienteId}`)).data,
  })

  if (atendimentos.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhuma sessão registrada ainda.</p>
  }

  return (
    <div className="space-y-2">
      {atendimentos.map((sessao) => {
        const isOpen = expandedId === sessao.id
        const marcacoesDaSessao = todasMarcacoes.filter((m) => m.visit_id === sessao.id)
        const fotosDaSessao = fotos.filter((f) => f.visit_id === sessao.id)

        return (
          <div key={sessao.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedId(isOpen ? null : sessao.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-800">
                {new Date(sessao.data_atendimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-xs text-gray-400">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                <MarkingList markings={marcacoesDaSessao} />
                {fotosDaSessao.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {fotosDaSessao.map((f) => (
                      <img key={f.id} src={f.url} alt={f.tipo} className="w-20 h-20 object-cover rounded-lg border border-gray-100" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/marcacao/HistoricoMarcacoes.tsx
git commit -m "feat: componente HistoricoMarcacoes (acordeão de sessões por data)"
```

---

### Task 9: Nova aba "Histórico" em `FichaPaciente.tsx`

**Files:**
- Modify: `frontend/src/pages/FichaPaciente.tsx`

- [ ] **Step 1: Import, tipo `Aba` e array de abas**

Troque:

```tsx
import { ArrowLeft, MessageCircle, Calendar, Phone, Mail, TrendingUp, CheckCircle2, Clock, XCircle, LayoutDashboard, Syringe } from 'lucide-react'
import { api } from '../api/client'
import type { Paciente, Agendamento, Conversa } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { StatusStepper } from '../components/StatusStepper'
import { MarcacaoDigital } from '../components/marcacao/MarcacaoDigital'

type Aba = 'visao_geral' | 'marcacao_digital'

const ABAS: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'visao_geral', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'marcacao_digital', label: 'Marcação Digital', icon: Syringe },
]
```

por:

```tsx
import { ArrowLeft, MessageCircle, Calendar, Phone, Mail, TrendingUp, CheckCircle2, Clock, XCircle, LayoutDashboard, Syringe, History } from 'lucide-react'
import { api } from '../api/client'
import type { Paciente, Agendamento, Conversa } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { StatusStepper } from '../components/StatusStepper'
import { MarcacaoDigital } from '../components/marcacao/MarcacaoDigital'
import { HistoricoMarcacoes } from '../components/marcacao/HistoricoMarcacoes'

type Aba = 'visao_geral' | 'marcacao_digital' | 'historico'

const ABAS: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'visao_geral', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'marcacao_digital', label: 'Marcação Digital', icon: Syringe },
  { id: 'historico', label: 'Histórico', icon: History },
]
```

- [ ] **Step 2: Renderização condicional da aba nova**

Troque:

```tsx
      {aba === 'marcacao_digital' && id ? (
        <MarcacaoDigital pacienteId={id} />
      ) : (
        <div className="contents">
```

por:

```tsx
      {aba === 'marcacao_digital' && id ? (
        <MarcacaoDigital pacienteId={id} />
      ) : aba === 'historico' && id ? (
        <HistoricoMarcacoes pacienteId={id} />
      ) : (
        <div className="contents">
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no browser**

Abra a ficha de um paciente com pelo menos uma sessão de marcação já salva (criada durante a verificação da Task 7). Clique na aba "Histórico", confirme que a sessão aparece recolhida, expanda e confirme que mostra as marcações e fotos certas daquela sessão.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FichaPaciente.tsx
git commit -m "feat: nova aba Histórico na ficha do paciente"
```

---

### Task 10: Verificação final

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar toda a suite de backend**

Run: `cd backend && npm test`
Expected: todos os testes passam, incluindo os novos em `marcacoes.test.ts` (os 2 arquivos pré-existentes com problemas conhecidos e não relacionados — `confirmacao.test.ts` e qualquer teste sem `Host` header — não fazem parte do escopo deste plano).

- [ ] **Step 2: Typecheck completo**

Run: `cd backend && npm run typecheck && cd ../frontend && npx tsc --noEmit`
Expected: sem erros em nenhum dos dois.

- [ ] **Step 3: Roteiro completo de verificação manual no browser**

Com os dois servidores rodando localmente, na ficha de um paciente real:

1. Marcar 3 pontos do mesmo produto usando a lista lateral — confirma que é mais rápido que antes (sem reabrir dropdown a cada clique).
2. Marcar 1 ponto sem produto armado — confirma que o popup completo de hoje continua funcionando.
3. Anexar uma foto "Antes" e uma foto "Depois" na sessão atual — confirma que aparecem no comparador.
4. Salvar o protocolo (botão "Salvar protocolo") — confirma que a sessão atual é concluída sem erro.
5. Abrir a aba "Histórico" — confirma que a sessão recém-concluída aparece, expande corretamente, mostra as marcações e as 2 fotos juntas.
6. Criar uma segunda sessão (volta pra aba Marcação Digital, marca algo novo) e confirma que o Histórico mostra as duas sessões separadas, cada uma com seus próprios dados.

- [ ] **Step 4: Avisar o usuário sobre o deploy**

Seguindo o padrão desta sessão: as migrations `015` e `016` precisam ser aplicadas manualmente no Supabase Studio (já devem ter sido aplicadas nas Tasks 1 e 2 — confirmar). Depois do push, o backend (Render) sobe automático; o frontend (Vercel) precisa do passo manual de "Promover" de sempre.
