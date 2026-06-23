# Melhorias na Marcação Digital — Orrin CRM

**Data:** 2026-06-23
**Status:** Aprovado
**Arquitetura:** 3 melhorias independentes na tela de Marcação Digital — lista de produtos para marcação rápida, aba de histórico por sessão, e upload real de fotos antes/depois ligado à sessão

---

## Decisões Finais

| Tópico | Decisão |
|---|---|
| Lista de produtos | Nova coluna lateral (reaproveita a coluna direita de 320px já existente), agrupada por categoria, acima da lista "Marcações da sessão" |
| Fluxo rápido | Clica no produto pra "armar" → clica no mapa → popup só com quantidade (sem dropdown, sem lote) → produto continua armado pro próximo clique |
| Fallback | Sem produto armado, clicar no mapa abre o popup completo de hoje (dropdown + quantidade + lote) — comportamento atual preservado, sem regressão |
| Aba Histórico | Nova aba em `FichaPaciente.tsx`, ao lado de "Visão Geral" e "Marcação Digital" |
| Layout do histórico | Acordeão recolhido por padrão, mais recente no topo. Expande pra ver marcações (somente leitura) e fotos daquela sessão |
| Upload de foto | Substitui a rota que só aceitava URL pronta (nunca foi usada) por upload real via multer + Supabase Storage, mesmo padrão da foto do profissional |
| Foto ligada à sessão | Nova coluna `visit_id` (nullable) em `fotos_paciente`. Toda foto nova é ligada à sessão atual automaticamente. Fotos antigas continuam funcionando sem essa ligação |
| Comparador Antes/Depois | Sem mudança — continua escolhendo entre todas as fotos do paciente via dropdown |

---

## Seção 1: Lista de produtos + marcação rápida

### Novo: `frontend/src/components/marcacao/ProductSidebar.tsx`

Lista de produtos agrupada por categoria (mesmo agrupamento que `CATEGORIA_LABELS` em `MarkingList.tsx` já define), cada item clicável:

```tsx
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

### Modificar: `frontend/src/components/marcacao/MarkingEditor.tsx`

Novo prop opcional `lockedProduct`. Quando presente, esconde o `<select>` de produto e o campo de lote, mostra o nome do produto travado, e foca direto no campo de quantidade:

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
```

Dentro do componente: se `lockedProduct` existir, `product_id` inicial é `lockedProduct.id` (fixo, sem `<select>`), o bloco do campo "Lote" não é renderizado, e o `<input>` de quantidade recebe `autoFocus`. O `<form>` e o `handleSubmit` continuam os mesmos — só a parte visual de produto/lote muda condicionalmente.

### Modificar: `frontend/src/components/marcacao/MarcacaoDigital.tsx`

- Novo estado: `const [selectedProductId, setSelectedProductId] = useState<string | null>(null)`.
- `<ProductSidebar injetaveis={injetaveis} selectedId={selectedProductId} onSelect={setSelectedProductId} />` renderizado no topo da coluna lateral, antes do bloco "Marcações da sessão".
- No `MarkingEditor` já renderizado (dentro do popover do mapa), passar `lockedProduct={injetaveis.find((p) => p.id === selectedProductId)}` quando `selectedProductId` não for `null`.
- `handleSaveMarking` não muda — continua recebendo `product_id` no objeto salvo, vindo do editor (travado ou não).
- Produto armado **não** é limpo depois de salvar uma marcação — só limpa se o usuário clicar nele de novo (deselecionar) ou clicar em outro produto.

---

## Seção 2: Aba Histórico

### Novo: `frontend/src/components/marcacao/HistoricoMarcacoes.tsx`

```tsx
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

`MarkingList` é chamado sem `onEdit`/`onRemove` — fica somente leitura, exatamente como já se comporta hoje quando essas props não são passadas.

`InjectionMarking` e `FotoPaciente` (em `frontend/src/types/index.ts`) já têm `visit_id`/`paciente_id` — `FotoPaciente` ganha o campo novo `visit_id: string | null` (ver Seção 3).

### Modificar: `frontend/src/pages/FichaPaciente.tsx`

```ts
type Aba = 'visao_geral' | 'marcacao_digital' | 'historico'
```

Nova entrada no array de tabs: `{ id: 'historico', label: 'Histórico', icon: History }` (ícone `History` de `lucide-react`), e novo bloco condicional:

```tsx
{aba === 'historico' && id ? (
  <HistoricoMarcacoes pacienteId={id} />
) : null}
```

Nenhuma rota de backend nova é necessária — reaproveita `GET /marcacoes/atendimentos/:paciente_id`, `GET /marcacoes/paciente/:paciente_id` e `GET /marcacoes/fotos/:paciente_id`, todas já existentes.

---

## Seção 3: Upload de foto ligado à sessão

### Migration nova: `supabase/migrations/015_foto_paciente_visit.sql`

```sql
ALTER TABLE fotos_paciente ADD COLUMN visit_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL;
CREATE INDEX idx_fotos_paciente_visit ON fotos_paciente(visit_id);
```

Nullable: fotos já existentes continuam válidas sem essa ligação. Precisa ser aplicada manualmente pelo usuário no SQL Editor do Supabase Studio, como as migrations anteriores desta sessão.

### Modificar: `backend/src/routes/marcacoes.ts`

Remove a rota antiga `POST /fotos` (recebia uma URL pronta — nunca foi chamada por nenhum código, confirmado por busca no repositório). No lugar, mesmo padrão de `profissionais.ts`:

```ts
import multer from 'multer'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

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

`GET /fotos/:paciente_id` não muda (já faz `select('*')`, `visit_id` vem de graça).

### Modificar: `backend/package.json`

Já tem `multer`/`@types/multer` instalados desde a feature de foto do profissional — nenhuma dependência nova.

### Modificar: `frontend/src/types/index.ts`

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

### Modificar: `frontend/src/components/marcacao/BeforeAfterSlider.tsx`

Novo bloco de upload, sempre visível no topo do card (antes do slider/seletores):

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

Renderizado no topo do `return` do `BeforeAfterSlider`, antes do bloco `if (!fotoAntes || !fotoDepois)`.

### Modificar: `frontend/src/components/marcacao/MarcacaoDigital.tsx`

Mesma lógica de "garantir que existe uma sessão em andamento" que `handleSaveMarking` já tem, extraída para reutilizar nos dois lugares:

```ts
const ensureVisit = useCallback(async (): Promise<string> => {
  if (currentVisitId) return currentVisitId
  const resp = await api.post('/marcacoes/atendimentos', { paciente_id: pacienteId })
  queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
  return resp.data.id
}, [currentVisitId, pacienteId, queryClient])
```

`handleSaveMarking` passa a chamar `await ensureVisit()` no lugar do bloco `if (!visitId) { ... }` que tinha antes (mesmo comportamento, só extraído).

Nova mutation:

```ts
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

`<BeforeAfterSlider ... onUpload={(file, tipo) => uploadFoto.mutate({ file, tipo })} isUploading={uploadFoto.isPending} />`.

---

## Seção 4: Erros e Validação

| Caso | Onde | Resultado |
|---|---|---|
| Arquivo de foto > 5MB | Servidor (`multer limits`) | 400, "Arquivo muito grande (máx. 5MB)" |
| Mimetype inválido | Servidor | 400, "Formato inválido. Use JPG, PNG ou WEBP." |
| Nenhum arquivo enviado | Servidor | 400, "Arquivo \"foto\" é obrigatório" |
| `paciente_id` ausente no upload | Servidor | 400, "paciente_id é obrigatório" |
| Clique no mapa sem produto armado | Cliente | Abre o popup completo de hoje (dropdown + lote) — comportamento inalterado |
| Aba Histórico sem nenhuma sessão | Cliente | Mensagem "Nenhuma sessão registrada ainda." em vez de acordeão vazio |

---

## Seção 5: Testes

`backend/tests/marcacoes.test.ts` (criar se não existir, seguindo o padrão de login real + requests autenticados já usado nos outros testes):

- `POST /api/marcacoes/fotos/upload` com buffer JPEG pequeno + `visit_id` válido → `201`, retorna `visit_id` preenchido.
- `POST /api/marcacoes/fotos/upload` sem `visit_id` → `201`, `visit_id` é `null` (foto solta, continua válida).
- `POST /api/marcacoes/fotos/upload` sem arquivo → `400`.
- `POST /api/marcacoes/fotos/upload` com mimetype inválido (`text/plain`) → `400`.
- `GET /api/marcacoes/fotos/:paciente_id` retorna fotos com `visit_id` no payload.

Frontend: verificação manual no browser —
1. Armar um produto na lista lateral, marcar 3 pontos seguidos no mapa, confirmar que abre só o popup de quantidade e que o produto continua armado entre cliques.
2. Sem produto armado, clicar no mapa e confirmar que abre o popup completo (com dropdown e lote), igual hoje.
3. Abrir a aba Histórico, expandir uma sessão antiga, confirmar que mostra as marcações certas.
4. Anexar uma foto "Antes" numa sessão, abrir a aba Histórico e confirmar que a foto aparece junto daquela sessão.

---

## Checklist Final

- [ ] Migration `015_foto_paciente_visit.sql` aplicada no Supabase (manual, pelo usuário)
- [ ] `ProductSidebar.tsx` criado
- [ ] `MarkingEditor.tsx` com prop `lockedProduct`
- [ ] `MarcacaoDigital.tsx`: estado de produto armado, `ensureVisit` extraído, mutation de upload
- [ ] `HistoricoMarcacoes.tsx` criado
- [ ] `FichaPaciente.tsx`: nova aba "Histórico"
- [ ] Rota `POST /marcacoes/fotos/upload` substitui a antiga `POST /fotos`
- [ ] `FotoPaciente` (frontend) e tipo de retorno (backend) incluem `visit_id`
- [ ] `BeforeAfterSlider.tsx`: bloco de upload com seletor de tipo
- [ ] Testes novos em `marcacoes.test.ts` passando
- [ ] Verificação manual no browser (os 4 cenários da Seção 5)
