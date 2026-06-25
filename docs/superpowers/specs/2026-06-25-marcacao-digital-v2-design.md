# Marcação Digital v2 — fundo customizável + ferramentas de desenho

## Contexto

A Marcação Digital (implementada em 2026-06-23) já suporta: sidebar de produtos por categoria, histórico de sessões por data, e upload de fotos antes/depois. O usuário viu um vídeo de um concorrente (Guildon, módulo de injetáveis) e quer aproximar a Marcação Digital desse nível, especificamente:

1. Opção de usar um rosto **masculino** (hoje só existe um conjunto de imagens, sem variação).
2. Marcar diretamente sobre a **foto real do paciente**, com controle de opacidade.
3. Ferramentas de desenho além do ponto — **linha** (faz sentido pra Fios PDO, que seguem um trajeto) e **forma/área**.
4. Categoria de produto "Enzimas" (única do vídeo que falta — as outras já existem).

## Decisão de arquitetura: fundo customizável resolve (1) e (2) juntos

Não dá pra "desenhar" uma ilustração anatômica masculina de verdade — isso é um asset gráfico, não código. Em vez de fixar um rosto masculino no código, a solução é uma funcionalidade mais geral: **o fundo do diagrama passa a ser trocável**, com 3 modos por sessão (atendimento):

- `anatomico` (padrão atual, sem mudança — troca entre as 5 vistas existentes)
- `foto_paciente` — usa uma foto já cadastrada do paciente como fundo
- `imagem_referencia` — usa uma imagem de uma biblioteca reutilizável por clínica (ex: a clínica sobe uma vez "Rosto Masculino" e reusa em todos os pacientes homens)

Todos os modos ganham um slider de opacidade (10–100%, padrão 100%).

## Modelo de dados

```sql
-- migrations/017_marcacao_avancada.sql

ALTER TABLE injection_markings
  ADD COLUMN tipo_desenho VARCHAR(10) NOT NULL DEFAULT 'ponto'
    CHECK (tipo_desenho IN ('ponto', 'linha', 'forma')),
  ADD COLUMN pontos JSONB; -- array [{x,y}, ...] pra linha/forma; NULL quando ponto (usa as colunas x/y existentes)

ALTER TABLE injetaveis DROP CONSTRAINT injetaveis_categoria_check;
ALTER TABLE injetaveis ADD CONSTRAINT injetaveis_categoria_check CHECK (categoria IN (
  'botox', 'filler', 'pdo_wire', 'bioestimulador', 'bioremodelador', 'skinbooster', 'enzimas', 'outro'
));

CREATE TABLE imagens_referencia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizacoes(id),
  nome        VARCHAR(100) NOT NULL,
  url         TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_imagens_referencia_tenant ON imagens_referencia(tenant_id);
ALTER TABLE imagens_referencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON imagens_referencia
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

ALTER TABLE atendimentos
  ADD COLUMN background_modo VARCHAR(20) NOT NULL DEFAULT 'anatomico'
    CHECK (background_modo IN ('anatomico', 'foto_paciente', 'imagem_referencia')),
  ADD COLUMN background_foto_id UUID REFERENCES fotos_paciente(id) ON DELETE SET NULL,
  ADD COLUMN background_imagem_id UUID REFERENCES imagens_referencia(id) ON DELETE SET NULL,
  ADD COLUMN background_opacidade INT NOT NULL DEFAULT 100
    CHECK (background_opacidade BETWEEN 10 AND 100);
```

`x`/`y` continuam existindo e são usados quando `tipo_desenho = 'ponto'` (sem mudança de comportamento pra marcações já existentes). Pra `linha`/`forma`, a geometria vai em `pontos` (mínimo 2 pontos pra linha, mínimo 3 pra forma) e `x`/`y` recebem o primeiro ponto do trajeto (só pra exibições que ainda esperam um único par, como thumbnails).

## Backend

**`backend/src/routes/marcacoes.ts`:**
- `POST /marcacoes`: aceitar `tipo_desenho` (default `'ponto'`) e `pontos` (opcional). Validar: `ponto` exige `x`/`y`; `linha` exige `pontos.length >= 2`; `forma` exige `pontos.length >= 3`.
- `PATCH /marcacoes/atendimentos/:id`: aceitar `background_modo`, `background_foto_id`, `background_imagem_id`, `background_opacidade` (todos opcionais, atualiza só o que vier — mesmo padrão já usado em outras rotas PATCH desse projeto, nunca sobrescrever com vazio o que não foi enviado).

**Novo `backend/src/routes/imagens-referencia.ts`** (seguir exatamente o padrão de upload já usado em `POST /marcacoes/fotos/upload`, multer + Supabase Storage):
- `GET /imagens-referencia` — lista da clínica (tenant_id do usuário logado)
- `POST /imagens-referencia/upload` — multipart, campos `nome` + arquivo `imagem`
- `DELETE /imagens-referencia/:id`

## Frontend

**`frontend/src/components/marcacao/BodyMapSVG.tsx`:**
- Novo prop opcional `backgroundOverride?: { url: string; opacityPercent: number }`. Quando presente, renderiza essa imagem (com `opacity: opacityPercent/100` no estilo) no lugar de `IMAGE_MAP[viewType]`. Sem override, comportamento idêntico ao atual.
- Novo prop `tool: 'ponto' | 'linha' | 'forma'` (default `'ponto'`).
- Quando `tool !== 'ponto'`: cliques no canvas acumulam pontos num estado local (`drawingPoints`), desenhados como `<polyline>`/`<polygon>` temporário enquanto o usuário desenha. Um botão "Concluir" (aparece quando há pontos suficientes) ou duplo-clique finaliza e chama um novo callback `onFinishPath?: (pontos: {x:number;y:number}[]) => void`. Esc ou um botão "Cancelar" limpa o desenho em progresso.
- Renderização das marcações existentes: hoje só desenha círculo. Adicionar branch por `m.tipo_desenho`: `'ponto'` → círculo atual (sem mudança); `'linha'` → `<polyline points={...}>` na cor do produto + pequenos círculos nas pontas; `'forma'` → `<polygon points={...}>` preenchido na cor do produto com opacidade baixa (~0.25) e borda sólida.

**Novo `frontend/src/components/marcacao/DrawToolbar.tsx`:** 3 botões (ícones lucide-react: `Circle`, `Minus`/linha, `Square`) pra escolher a ferramenta ativa. Quando o produto armado na sidebar tiver `categoria === 'pdo_wire'`, sugerir automaticamente a ferramenta "linha" (só muda o padrão, usuário pode trocar manualmente).

**Novo `frontend/src/components/marcacao/BackgroundPicker.tsx`:** 3 opções (Anatômico / Foto do paciente / Imagem de referência) + slider de opacidade (desabilitado quando "Anatômico"). "Foto do paciente" lista as fotos já em `fotos_paciente` desse paciente pra escolher uma. "Imagem de referência" lista `imagens_referencia` da clínica com botão "+ Adicionar" (abre upload simples nome+arquivo).

**`frontend/src/components/marcacao/MarkingEditor.tsx`:** sem mudança de campos — continua só produto/quantidade/lote. Passa a ser chamado tanto depois de um clique simples (ponto) quanto depois de um "Concluir" de linha/forma.

**`frontend/src/components/marcacao/MarkingList.tsx`:** mostrar um ícone pequeno indicando ponto/linha/forma ao lado do nome do produto.

**`frontend/src/components/marcacao/MarcacaoDigital.tsx`:** novo estado `tool`; estado de background lido/gravado em `currentVisit.background_*` (via `PATCH /marcacoes/atendimentos/:id`); ao escolher fundo "Foto do paciente" ou "Imagem de referência", esconder o seletor de vistas (Frontal/Perfil Esq./etc.) já que passa a existir só UMA imagem de fundo pra aquela sessão.

## Critério de aceite

- Marcação por ponto continua funcionando exatamente como hoje (nenhuma regressão).
- Dá pra trocar o fundo da sessão pra uma foto do paciente ou uma imagem da biblioteca, com opacidade ajustável, e marcar normalmente sobre ela.
- Dá pra desenhar uma linha (≥2 pontos) ou uma forma (≥3 pontos), associar a um produto/quantidade, e ver isso na lista de aplicações e no histórico.
- Categoria "Enzimas" aparece na sidebar de produtos.
- Tudo coberto por testes de integração reais (sem mocks), seguindo o padrão já usado nos outros arquivos de teste do projeto.
