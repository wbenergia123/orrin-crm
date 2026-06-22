# Trocar Foto do Profissional — Orrin CRM

**Data:** 2026-06-22
**Status:** Aprovado
**Arquitetura:** Upload multipart → backend (multer) → Supabase Storage (service role) → coluna `foto_url`

---

## Decisões Finais

| Tópico | Decisão |
|---|---|
| Onde editar | Diálogo de editar profissional, em `Profissionais.tsx` (só em modo edição, não na criação) |
| Upload | Via backend (multer + `supabaseAdmin`), sem chamada direta do browser ao Supabase Storage |
| Storage | Novo bucket público `fotos-profissionais` |
| Coluna nova | `profissionais.foto_url TEXT` (nullable) |
| Tipos aceitos | `image/jpeg`, `image/png`, `image/webp` |
| Tamanho máximo | 5MB |
| Remover foto | Botão para voltar ao avatar gerado automaticamente (`foto_url = null`) |
| Limpeza de storage | Fora de escopo — fotos antigas substituídas não são apagadas do bucket (custo de storage irrelevante neste estágio) |
| Pré-requisito | Suite de testes do backend está quebrada (ver Seção 0) — corrigida como parte deste trabalho, pois é necessária para testar a feature |

---

## Seção 0: Pré-requisito — corrigir a suite de testes do backend

A migration mais recente (`feat: implementa backend da clínica`) adicionou `backend/tests/*.test.ts`, `vitest.config.ts` e referências a `supertest`, mas:

- `vitest`, `supertest` e `@types/supertest` **não estão em `package.json`** (nem em `dependencies` nem em `devDependencies`).
- Não existe script `"test"` em `package.json`.
- Todos os testes importam `import { createApp } from '../src/app'`, mas **`backend/src/app.ts` não existe** — só `backend/src/index.ts`, que monta o `express()` e já chama `app.listen(...)` diretamente.

Resultado: `npm test` falha (script nem existe) e `npx vitest run` falha ao carregar a config (módulo `vitest/config` não resolvido). A suite nunca foi executada com sucesso.

Como este spec exige testar a nova rota de upload, a correção mínima é parte do trabalho:

1. **Extrair `backend/src/app.ts`**: mover todo o conteúdo de `index.ts` para uma função `createApp()` que monta e retorna o `express()` configurado (todos os `app.use(...)`, CORS, rotas, 404 handler) — **sem** chamar `app.listen`.
2. **`backend/src/index.ts`** passa a ser:
   ```ts
   import { createApp } from './app'

   const app = createApp()
   const PORT = process.env.PORT || 3001
   app.listen(PORT, () => {
     console.log(`Backend rodando em http://localhost:${PORT}`)
   })
   ```
3. **`backend/package.json`**: adicionar `devDependencies`: `vitest`, `supertest`, `@types/supertest` (versões mais recentes compatíveis) e o script `"test": "vitest run"`.

Não faz parte deste trabalho corrigir a lógica interna dos 14 arquivos de teste já existentes — só destravar a execução. Se algum teste pré-existente falhar por motivo não relacionado a este spec, isso é reportado separadamente, não bloqueia esta feature.

---

## Seção 1: Database

Nova migration `supabase/migrations/009_foto_profissional.sql`:

```sql
ALTER TABLE profissionais ADD COLUMN foto_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-profissionais', 'fotos-profissionais', true)
ON CONFLICT DO NOTHING;
```

Sem policy de RLS em `storage.objects`: todo o acesso de escrita passa pelo backend usando `supabaseAdmin` (service role, ignora RLS). O bucket é `public: true` apenas para permitir leitura direta da URL em `<img>`, que é o mesmo padrão já usado (ainda que não funcional) em `fotos-pacientes` na migration 004.

---

## Seção 2: Backend

### `backend/src/routes/profissionais.ts`

Duas rotas novas, usando `multer` com `memoryStorage` (sem gravar em disco):

```ts
import multer from 'multer'

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

### `backend/package.json`

Adicionar `multer` em `dependencies` e `@types/multer` em `devDependencies`.

---

## Seção 3: Frontend

### `frontend/src/types/index.ts`

```ts
export interface Profissional {
  id: string
  nome: string
  ativo: boolean
  foto_url: string | null
}
```

### Novo: `frontend/src/lib/avatar.ts`

Hoje a lógica de cor/fallback do avatar vive só dentro de `Agenda.tsx` (`profissionalColor`, `fallbackSrc`, `avatarSrc`). Como o diálogo de edição em `Profissionais.tsx` vai precisar exibir o mesmo avatar, extraio para um helper compartilhado:

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

`Agenda.tsx`: `CardProfissional` passa a usar `getAvatarUrl(profissional)` / `getAvatarFallback(profissional.nome)` no lugar da lógica inline — comportamento idêntico ao atual quando `foto_url` é `null`, e mostra a foto real quando existir.

### `frontend/src/pages/Profissionais.tsx`

Dentro de `ProfissionalDialog`, só quando `profissional` existe (modo edição):

- Avatar circular (80px) usando `getAvatarUrl`/`getAvatarFallback`, com um ícone de câmera sobreposto no canto inferior direito.
- Clique no avatar abre um `<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden">`.
- Ao selecionar um arquivo:
  - valida tamanho no cliente (`file.size > 5 * 1024 * 1024` → mostra erro sem chamar a API);
  - monta `FormData` com o campo `foto` e chama a mutation de upload.
- Mutation de upload/remoção:
  ```ts
  const { mutate: enviarFoto, isPending: enviandoFoto } = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('foto', file)
      return api.post(`/profissionais/${profissional!.id}/foto`, form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
      setErroFoto(null)
    },
    onError: () => setErroFoto('Não foi possível enviar a foto. Tente novamente.'),
  })

  const { mutate: removerFoto } = useMutation({
    mutationFn: () => api.delete(`/profissionais/${profissional!.id}/foto`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
    },
  })
  ```
  (`profissionais-todos` é a queryKey usada em `Agenda.tsx` — invalidar as duas garante que a foto nova apareça tanto na tabela de Profissionais quanto no card da Agenda sem precisar recarregar a página.)
- Erro de upload exibido como texto pequeno vermelho abaixo do avatar (`erroFoto`, estado local — não existe lib de toast no projeto, então sigo o padrão simples já usado).
- Botão "Remover foto" (texto pequeno, só aparece se `profissional.foto_url` existir).
- Em modo criação (`profissional` indefinido), a seção de avatar não é renderizada — a foto só pode ser definida depois que o profissional existe.

---

## Seção 4: Erros e Validação

| Caso | Onde | Resultado |
|---|---|---|
| Arquivo > 5MB | Cliente (antes do POST) e servidor (`multer limits`) | 400, mensagem "Arquivo muito grande" |
| Mimetype inválido | Servidor | 400, "Formato inválido. Use JPG, PNG ou WEBP." |
| Nenhum arquivo enviado | Servidor | 400, "Arquivo \"foto\" é obrigatório" |
| `id` não existe ou é de outro tenant | Servidor (checagem antes do upload) | 404, "Profissional não encontrado" — evita subir arquivo órfão no bucket |
| Falha no Supabase Storage | Servidor | 500 com a mensagem do erro |

---

## Seção 5: Testes

`backend/tests/profissionais.test.ts` (arquivo já existe, só adiciona casos), seguindo o padrão atual (login real via `/api/auth/login`, depois requests autenticados):

- `POST /api/profissionais/:id/foto` com um buffer JPEG pequeno → `200` e `foto_url` preenchido.
- `POST /api/profissionais/:id/foto` sem arquivo → `400`.
- `POST /api/profissionais/:id/foto` com mimetype não permitido (ex.: `text/plain`) → `400`.
- `POST /api/profissionais/:id/foto` com `id` inexistente → `404`.
- `DELETE /api/profissionais/:id/foto` → `200` e `foto_url` volta a `null`.

Frontend: verificação manual no browser (upload, troca, remoção, e confirmar que a foto nova aparece no card da Agenda sem reload).

---

## Checklist Final

- [ ] `app.ts` extraído, `index.ts` simplificado, `npm test` roda
- [ ] `vitest`, `supertest`, `@types/supertest`, `multer`, `@types/multer` instalados
- [ ] Migration `009_foto_profissional.sql` aplicada no Supabase
- [ ] Rotas `POST` / `DELETE` `/api/profissionais/:id/foto`
- [ ] `Profissional.foto_url` no type compartilhado
- [ ] `lib/avatar.ts` criado e usado em `Agenda.tsx` e `Profissionais.tsx`
- [ ] UI de upload/remoção no diálogo de edição
- [ ] Testes novos em `profissionais.test.ts` passando
- [ ] Verificação manual no browser
