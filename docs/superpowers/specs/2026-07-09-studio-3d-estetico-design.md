# Studio 3D — simulação estética facial em 3D (estilo Crisalix)

## Contexto

Novo módulo para o profissional gerar uma cabeça 3D texturizada do paciente a partir de 2–4 fotos, girar o modelo no browser e simular procedimentos estéticos (nariz, lábios, queixo, malar) com sliders em tempo real, comparar antes/depois e exportar um PNG para enviar ao paciente. Referência de produto: Crisalix (simulador 3D usado por clínicas de estética).

Decisões tomadas no brainstorm:

1. **Escopo estético/apresentação apenas.** O módulo serve para visualização na consulta — encantar e alinhar expectativa. **Não** calcula métricas clínicas, proporções "ideais" nem medidas em mm/cc. Isso elimina a necessidade de geometria métrica (sensor de profundidade, detector de landmarks, calibração de escala) e a maior parte do risco médico-legal. Disclaimer fixo na tela do simulador: *"Simulação ilustrativa — não representa promessa de resultado."* (a própria Crisalix usa rodapé equivalente).
2. **Motor de geração: Meshy API (Multi-Image to 3D).** Para fim visual, o Meshy entrega cabeça densa, texturizada e reconhecível (validado com modelos reais da galeria deles). As limitações do Meshy (sem escala real, profundidade estimada, sem landmarks) só afetariam medição — que está fora do escopo.
3. **Âncoras por clique em vez de detecção automática.** Sem pipeline Python/Open3D: o profissional posiciona uma vez as âncoras de deformação (ponta do nariz, lábio superior/inferior, queixo, malar E/D) clicando no modelo (raycast). ~30 segundos, salvo no banco, feito uma única vez por modelo.
4. **Item próprio na sidebar ("Studio 3D", acima de Configurações), com gate por clínica.** O recurso não é liberado para todas as clínicas: coluna `studio_3d_ativo` em `organizacoes`, controlada pelo super_admin no painel Admin. Clínica sem o recurso vê o item com cadeado (teaser); as rotas do backend retornam 403.

## Fora de escopo (deliberado — evolução futura)

- Métricas clínicas / painel de proporções / medições em cm ou cc.
- Detecção automática de landmarks, app iOS/TrueDepth, fotogrametria.
- Ferramenta de curvas livres ("Curves Tool" da Crisalix), wizard de pálpebra, peeling por zonas, editor de cicatriz.
- Morph 2D fotorrealista sobre a foto (possível fase 2 para o "antes/depois de WhatsApp").
- Billing real por geração (fica um teto simples de créditos por clínica).

## Modelo de dados

```sql
-- migrations/025_studio_3d.sql

ALTER TABLE organizacoes
  ADD COLUMN studio_3d_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN studio_3d_limite_creditos_mes INT NOT NULL DEFAULT 150; -- ~5 gerações/mês

CREATE TABLE simulacoes_3d (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id       UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  criado_por        UUID REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ DEFAULT now(),
  atualizado_em     TIMESTAMPTZ DEFAULT now(),

  -- Geração Meshy
  meshy_task_id     TEXT,
  status            VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  creditos_consumidos INT DEFAULT 0,

  -- Assets no Supabase Storage (paths internos; nunca URLs da Meshy)
  fotos_paths       TEXT[] NOT NULL DEFAULT '{}',
  modelo_glb_path   TEXT,
  thumbnail_path    TEXT,

  -- Estado da simulação
  ancoras           JSONB NOT NULL DEFAULT '{}',
  -- ex: { "nariz_ponta": {"x":0.02,"y":0.14,"z":0.09}, "labio_sup": {...}, ... }
  sliders           JSONB NOT NULL DEFAULT '{}',
  -- ex: { "nariz_ponta": 0.35, "labio_sup": -0.2 } (valores normalizados -1..1)
  screenshot_path   TEXT,
  notas             TEXT
);
CREATE INDEX idx_simulacoes_3d_tenant_paciente ON simulacoes_3d(tenant_id, paciente_id);
ALTER TABLE simulacoes_3d ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON simulacoes_3d
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');
```

**Reuso de modelo:** o modelo 3D pertence à *simulação*, mas ao criar uma nova simulação para um paciente que já tem uma `succeeded`, o backend oferece clonar (copia `modelo_glb_path` + `ancoras`, zera `sliders`) em vez de gerar de novo — geração nova é ação explícita (`forcar_geracao: true`). Custo zero para novas simulações sobre o mesmo modelo.

**Storage:** bucket privado `simulacoes-3d`, estrutura `{tenant_id}/{simulacao_id}/` com `foto_1.jpg..foto_4.jpg`, `modelo.glb`, `thumbnail.png`, `screenshot.png`. Acesso sempre via signed URL com expiração de 1 hora, geradas pelo backend. Nunca URLs públicas (fotos de paciente = dado sensível, LGPD).

## Integração Meshy

- `backend/src/lib/meshy.ts`: `criarTask(imageUrls)`, `consultarTask(taskId)`, `baixarGlb(url)`. Env var nova: `MESHY_API_KEY` (documentar em `backend/.env.example`).
- Payload de criação: endpoint Multi-Image to 3D com `should_texture: true` e formato `glb`. Parâmetros exatos (modelo, remesh, PBR) são conferidos na doc atual da Meshy durante a implementação — **não** confiar em versões de parâmetros vindas de material antigo. As fotos são enviadas como signed URLs de 1h do nosso bucket.
- **Regra crítica:** a URL do GLB da Meshy expira. No momento em que o status vira `SUCCEEDED`, o backend baixa o GLB e o thumbnail e salva no bucket **antes** de marcar a simulação como `succeeded`. A URL da Meshy nunca é persistida.
- **Polling sem worker:** não há SSE nem job em background. O frontend consulta `GET /api/simulacoes/:id` a cada ~4s enquanto `status IN (pending, processing)`; esse handler consulta a Meshy, atualiza o registro e, no `SUCCEEDED`, faz o download/persistência inline. A geração leva ~1–2 min. `// ponytail: polling dirigido pelo cliente; worker/fila se aparecer uso concorrente pesado`.
- **Teto de créditos:** antes de criar task, o backend soma `creditos_consumidos` do tenant no mês corrente; se `+ 30 > studio_3d_limite_creditos_mes`, retorna 422 com mensagem clara. Falha da Meshy → créditos são reembolsados por eles → registrar `creditos_consumidos = 0` no registro `failed`.

## API

`backend/src/routes/simulacoes.ts`, registrado em `app.ts`:

```ts
app.use('/api/simulacoes', requireAuth, blockWritesWhenImpersonating, requireTenant, requireStudio3d, simulacoesRouter)
```

`requireStudio3d` (novo, em `middleware/auth.ts`): busca `studio_3d_ativo` da org do `req.user.tenant_id` (com cache, como o `orgCache` existente); se falso → 403 `{ error: 'Studio 3D não habilitado para esta clínica.' }`. Super_admin passa sempre.

| Rota | Ação |
|---|---|
| `GET /?paciente_id=` | lista simulações do paciente (tenant-scoped) |
| `POST /` | multipart: `paciente_id` + 2–4 fotos. Valida (jpeg/png, ≤10MB cada), sobe para o Storage, checa teto de créditos, cria task Meshy, insere registro `pending`. Se o paciente já tem simulação `succeeded` e `forcar_geracao` não veio: clona modelo/âncoras (sem Meshy, sem custo) |
| `GET /:id` | retorna registro; se `pending/processing`, consulta Meshy e atualiza (polling); inclui signed URLs (`modelo_glb_url`, `thumbnail_url`, `screenshot_url`) quando existirem |
| `PATCH /:id` | Zod: `ancoras?`, `sliders?`, `notas?` — persiste estado da simulação |
| `POST /:id/screenshot` | recebe PNG (base64 ou multipart) gerado no cliente, salva no bucket, grava `screenshot_path` |
| `DELETE /:id` | remove registro + assets do bucket |

Upload das fotos via `multer` (já é dependência do backend). O upload do GLB ao bucket é server-side (backend baixou da Meshy).

**Flag no frontend:** `GET /api/auth/me` passa a incluir `org: { studio_3d_ativo: boolean } | null` (join na org do usuário; `null` para super_admin sem tenant — tratado no front como liberado). Painel **Admin** ganha o toggle "Studio 3D" e o campo de limite de créditos por clínica (mesma tela onde já se gerencia `ativo`).

## Frontend

Deps novas: `three`, `@react-three/fiber`, `@react-three/drei`.

- **Sidebar** (`Sidebar.tsx`): item `{ to: '/studio-3d', label: 'Studio 3D' }` entre Financeiro e Configurações. Sem a flag → renderiza com ícone de cadeado e estado desabilitado; clique mostra tooltip/aviso "Recurso não habilitado para sua clínica — fale com o suporte". Com a flag → item normal.
- **Rota** `/studio-3d` no `App.tsx` → `pages/Studio3D.tsx`: seletor de paciente (busca, padrão dos selects existentes) + lista de simulações do paciente (thumbnail, data, notas) + botão "Nova simulação".
- **Componentes** em `components/simulacao/`:
  - `UploadFotos` — drag & drop 2–4 fotos com preview e orientação ("frontal + perfil esquerdo + perfil direito = melhor resultado"); dispara `POST /api/simulacoes`.
  - `ProgressoGeracao` — polling de `GET /:id` via TanStack Query (`refetchInterval` 4s enquanto pendente), barra de progresso e mensagens por etapa.
  - `Viewer3D` — react-three-fiber: carrega GLB via signed URL, `OrbitControls` (rotação/zoom), luz ambiente + direcional. Guarda `originalPositions: Float32Array` (clone do buffer na carga; nunca modificado). Expõe via ref: `aplicarSliders(valores)`, `resetar()`, `capturarPng()` (usa `gl.domElement.toDataURL` com `preserveDrawingBuffer`).
  - `WizardAncoras` — primeira abertura de um modelo sem âncoras: sequência guiada ("clique na ponta do nariz" → raycast → esfera de confirmação → próxima). Âncoras editáveis depois (botão "reposicionar âncoras"). Salva via `PATCH`.
  - `PainelSliders` — grupos Nariz / Lábios / Queixo / Malar. Cada slider referencia uma âncora e um eixo de deslocamento; valores normalizados −1..1 sobre um raio de influência relativo ao bounding box do modelo. Malar é espelhado (E/D juntos).
  - `BotaoAntesDepois` — alterna geometria original ↔ deformada (swap de buffer de positions); variante lado a lado fica para depois.
- **Motor de deformação** `frontend/src/lib/simulacao/deformacao.ts`: proportional editing radial — para cada âncora, desloca vértices dentro do raio de influência com peso `smoothstep(1 − d/r)`, sempre lendo de `originalPositions` e escrevendo no buffer ativo; `computeVertexNormals()` ao final do gesto (não a cada frame). **Otimização obrigatória:** no primeiro uso de cada âncora, pré-indexar os vértices dentro do raio (a malha Meshy tem >100k vértices; o slider itera só os ~poucos mil indexados). `// ponytail: índice linear por âncora; octree só se o gesto ainda engasgar`.
- **Config dos sliders** `frontend/src/lib/simulacao/regioes.ts`: lista estática de regiões/âncoras/eixos/raios (nariz ponta/dorso/largura, lábio sup/inf, queixo projeção/comprimento, malar volume). Constante de código — não precisa de tabela.

## Erros

- Meshy `FAILED` → registro `failed` + botão "Tentar novamente" no front (cria nova task; créditos da falha foram reembolsados pela Meshy).
- Timeout de geração (> 10 min sem sair de `processing`) → tratar como `failed` na próxima consulta.
- GLB > ~30MB ou download da Meshy falhou → `failed` com mensagem (não deixar registro eternamente `processing`).
- Fotos inválidas (formato/tamanho/quantidade) → 400 do Zod/multer antes de gastar crédito.
- Signed URL expirada no viewer (sessão > 1h) → refetch do `GET /:id` e recarrega.

## Testes

Backend (Vitest + supertest, padrão do repo — `backend/tests/simulacoes.test.ts`):
- `POST /` valida quantidade/formato de fotos e isolamento por tenant.
- `POST /` bloqueia quando teto de créditos estourado (422) e quando `studio_3d_ativo=false` (403).
- `POST /` clona modelo existente sem chamar a Meshy quando o paciente já tem simulação `succeeded`.
- `GET /:id` em `processing` consulta a Meshy (mock), e no `SUCCEEDED` persiste o GLB no bucket antes de responder `succeeded`.
- `PATCH /:id` persiste âncoras/sliders com Zod.

Frontend: teste de unidade do motor de deformação (`deformacao.test.ts` — peso smoothstep, vértices fora do raio intactos, reset restaura o buffer original byte a byte). O restante (viewer/wizard) é validado manualmente no fluxo.

## Riscos aceitos

- **Qualidade Meshy varia por foto**: fotos ruins (luz, ângulo) → modelo ruim. Mitigação: orientação visual no upload + regeneração explícita. É inerente ao motor.
- **Aparência "render 3D"** (levemente cerosa, não fotorrealista de pele) — aceito para o escopo de apresentação; o morph 2D fotorrealista é a fase 2 se houver demanda.
- **Dependência de um fornecedor pago (Meshy)** — isolada em `lib/meshy.ts`; trocar de motor não toca rotas, viewer nem morph.
