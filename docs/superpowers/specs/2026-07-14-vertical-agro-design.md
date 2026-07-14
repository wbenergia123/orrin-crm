# Vertical Agro (tenant Agrokhan) — Orrin CRM

**Data:** 2026-07-14
**Status:** Em avaliação
**Decisão base:** NÃO clonar o repo. A Agrokhan entra como tenant do vertical `agro` no mesmo codebase multi-tenant.

---

## 1. Contexto

**Cliente:** Agrokhan Implementos (agrokhan.com.br) — fabricante B2B de implementos agrícolas personalizados (Cascavel-PR). Venda consultiva: lead chama no WhatsApp, pede orçamento customizado, reunião (presencial ou virtual) com vendedor, fecha negócio. Terão **vários vendedores**.

**Por que tenant e não clone:** o Orrin já é multi-tenant (spec 2026-06-15: `tenant_id` + RLS + subdomínio via Vercel wildcard). Clone = manutenção dupla pra sempre (todo fix de webhook/auth/Pedro aplicado 2x). O core de prospecção B2B (clientes, reuniões, conversas, follow-up, Pedro focado em marcar reunião sem falar preço) descreve a venda da Agrokhan perfeitamente. Só a camada de clínica estética não serve — e ela é um conjunto delimitado de módulos, escondível por gating.

## 2. Decisões finais

| Tema | Decisão |
|------|---------|
| Estratégia | Mesmo repo, tenant `agrokhan` com vertical `agro` |
| Gating | Coluna `vertical TEXT NOT NULL DEFAULT 'clinica'` em `organizacoes` (`'clinica'` \| `'agro'`); `studio_3d_ativo` continua toggle separado |
| Pipeline v1 | Kanban sobre o `status` do cliente (sem entidade Negócio) — 1 negociação por cliente por vez |
| Vendedores | Reaproveitam módulo Profissionais (rótulo por vertical). Só cadastro, **sem login próprio** |
| Bloqueios | Ficam — férias/folga do vendedor, mesma tela, rótulo acompanha |
| Produtos | Catálogo **sem preço** (venda por orçamento; Pedro nunca fala preço) |
| Reuniões | Ganham `tipo` presencial/virtual, `link_video` (colado manualmente), `local`, vendedor responsável |
| Escopo v1 | Completo: gating + admin + vendedores + reuniões/agenda + produtos + kanban + Pedro agro + **Dashboard e Financeiro adaptados** |
| Financeiro agro | Receitas (fechamentos) + **despesas completas** (funcionário, aluguel, combustível, marketing, ADS...) + resultado do período |
| Não-regressão | Toda mudança em código compartilhado é aditiva; caminho da clínica nunca é alterado, só ramificado. Suíte de testes atual passa intacta em todo PR |

## 3. Módulos por vertical

### Escondidos no vertical agro (nada é deletado do código)

Pacientes/Ficha do Paciente, Agendamentos de consulta, Serviços, Injetáveis, Marcação Digital, Simulações/Studio 3D, Imagens de referência.

### Core compartilhado (funciona como está)

Auth multi-tenant, Clientes, Atendimentos (handoff bot↔humano), conversas WhatsApp/webhook UAZAPI, Follow-up automático, Configurações, Admin/Impersonar.

### Adaptados (ramificação por vertical, caminho clínica intocado)

| Módulo | Mudança no vertical agro |
|--------|--------------------------|
| Profissionais | Rótulo "Vendedores"; sem vínculo com serviços |
| Bloqueios | Igual — bloqueia agenda do vendedor (férias, folga) |
| Reuniões | + tipo, link, local, vendedor. Vira o coração da agenda agro |
| Agenda | react-big-calendar mostra reuniões por vendedor (em vez de consultas) |
| Pedro | Prompt por tenant (já existe no admin) + tool set selecionado por vertical |
| Dashboard | Métricas de funil de venda (seção 8) |
| Financeiro | Receitas + despesas + resultado (seção 7) |

### Novos (nascem vertical-agnósticos onde possível)

Produtos, Pipeline agro (kanban de clientes), Despesas.

## 4. Database (migrations aditivas, todas com RLS por tenant)

```sql
-- Vertical na organização
ALTER TABLE organizacoes ADD COLUMN vertical TEXT NOT NULL DEFAULT 'clinica'
  CHECK (vertical IN ('clinica', 'agro'));

-- Reuniões: tipo, link, local, vendedor
ALTER TABLE reunioes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'presencial'
  CHECK (tipo IN ('presencial', 'virtual'));
ALTER TABLE reunioes ADD COLUMN link_video TEXT;
ALTER TABLE reunioes ADD COLUMN local TEXT;
ALTER TABLE reunioes ADD COLUMN profissional_id UUID REFERENCES profissionais(id);
ALTER TABLE reunioes ADD COLUMN notas TEXT;

-- Catálogo de produtos (implementos) — sem preço
CREATE TABLE produtos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES organizacoes(id),
  nome       VARCHAR(255) NOT NULL,
  categoria  TEXT,
  descricao  TEXT,
  foto_url   TEXT,
  ativo      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_produtos_tenant ON produtos(tenant_id);

-- Campos agro no cliente (nullable — clínica ignora)
ALTER TABLE clientes ADD COLUMN produto_interesse_id UUID REFERENCES produtos(id);
ALTER TABLE clientes ADD COLUMN valor_estimado NUMERIC;
ALTER TABLE clientes ADD COLUMN valor_fechado NUMERIC;
ALTER TABLE clientes ADD COLUMN data_fechamento DATE;
ALTER TABLE clientes ADD COLUMN cidade TEXT;
ALTER TABLE clientes ADD COLUMN atividade TEXT;      -- soja, milho, pecuária...
ALTER TABLE clientes ADD COLUMN maquinas TEXT;       -- texto livre: trator/colheitadeira que possui

-- Despesas (vertical-agnóstica: tenant + dinheiro)
CREATE TABLE despesas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES organizacoes(id),
  descricao  TEXT NOT NULL,
  categoria  TEXT NOT NULL,          -- texto livre normalizado (seção 7)
  valor      NUMERIC NOT NULL,
  data       DATE NOT NULL,
  fixa       BOOLEAN DEFAULT FALSE,  -- repete todo mês (salário, aluguel)
  notas      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_despesas_tenant_data ON despesas(tenant_id, data);
```

RLS: mesmas policies por `auth.tenant_id()` das tabelas existentes, aplicadas a `produtos` e `despesas`.

**Status do cliente (funil agro):** `novo_lead → qualificado → reuniao_agendada → orcamento_enviado → negociacao → fechado | perdido`. As colunas do kanban são configuradas por vertical no frontend; o campo `status` é o mesmo que o Pedro já atualiza hoje.

## 5. Backend

- **Admin:** `POST/PATCH /admin/tenants` aceita `vertical`. Login/token injeta `vertical` no payload do usuário (mesmo caminho de `tenant_id`/`role`/`studio_3d_ativo`).
- **`produtos.ts`** (novo): CRUD, estruturalmente clone de `servicos.ts`.
- **`despesas.ts`** (novo): CRUD + `GET /despesas/resumo?de=&ate=` (soma por categoria) + `POST /despesas/copiar-fixas` (duplica as `fixa = true` do mês anterior pro mês atual).
- **`reunioes.ts`:** aceita os campos novos. Validação: `tipo = 'virtual'` exige `link_video`.
- **Tools do Pedro por vertical** — registry em `claude-tools.ts` que seleciona o set pelo vertical do tenant:
  - *Clínica:* set atual, intocado.
  - *Agro:* `atualizar_cliente` (nome, cidade, atividade, máquinas), `listar_produtos`, `registrar_interesse` (produto), `verificar_slots_vendedores` (adaptação do `verificar_slots`: agenda do vendedor + bloqueios, sobre `reunioes`), `criar_reuniao` (tipo, vendedor), `remarcar_reuniao`, `cancelar_reuniao`.
- **`dashboard.ts` / `financeiro.ts`:** ramificam por vertical do tenant (seções 7 e 8).

## 6. Frontend

- `usuario.vertical` disponível via `useAuth` (vem do token).
- **`VerticalRoute`** (~5 linhas): wrapper de rotas; vertical errado → `<Navigate to="/dashboard" />`. Rotas de clínica agrupadas sob `vertical="clinica"`, rotas agro sob `vertical="agro"`.
- **Sidebar:** itens ganham `vertical?`; filtro em `visibleItems` (uma linha a mais no filtro existente). Rótulos por vertical: "Profissionais"→"Vendedores". Sidebar agro: Dashboard, Pipeline, Clientes, Produtos, Vendedores, Agenda, Atendimentos, Financeiro, Configurações.
- **Telas novas:**
  - *Produtos* — clone de Serviços (nome, categoria, foto, descrição, ativo).
  - *Pipeline agro* — kanban de clientes por `status`; card mostra nome, produto de interesse, valor estimado, vendedor da próxima reunião. Arrastar pra "fechado" abre prompt do `valor_fechado`.
- **Adaptadas:** Agenda (reuniões por vendedor; modal de reunião com tipo presencial/virtual, link, local, vendedor), Clientes (campos agro na ficha), Dashboard e Financeiro (por vertical).

Esconder menu é UX; a segurança de dados já existe via RLS por `tenant_id` (usuário agro forçando `GET /api/pacientes` recebe lista vazia).

## 7. Financeiro agro

Três blocos, filtráveis por período (mês/ano):

1. **Receitas** — fechamentos do pipeline (`valor_fechado` por `data_fechamento`): total do período e por vendedor.
2. **Despesas** — CRUD completo (funcionário, aluguel, combustível, marketing, ADS, impostos, manutenção...):
   - **Categoria é texto livre com autocomplete**: sugere as categorias já usadas pelo tenant (`SELECT DISTINCT categoria`) + sugestões de fábrica. Normalização ao salvar (trim + capitalização) pra "ADS", "ads " e "Ads" não virarem três categorias.
   - **Gráfico por categoria**: qualquer categoria digitada aparece automaticamente no gráfico do período (agrupamento é `GROUP BY categoria`). Clicar numa fatia filtra a lista de despesas abaixo.
   - **Botão "Copiar fixas do mês anterior"**: duplica as despesas `fixa = true` pro mês atual (salário, aluguel), só ajustar o que mudou. Recorrência automática fica pra fase 2.
3. **Resultado** — DRE simplificado: receita − despesa do período (faturou X, gastou Y, sobrou Z).

`despesas` nasce vertical-agnóstica; na v1 só aparece no Financeiro agro (não tocar na experiência da clínica). Ligar pras clínicas é decisão futura sem retrabalho.

## 8. Dashboard agro

- Leads novos no período
- Reuniões da semana (por vendedor)
- Taxa de conversão lead→reunião e reunião→fechamento
- Valor fechado no mês

## 9. Admin — fluxo de onboarding da Agrokhan

1. Criar tenant: slug `agrokhan`, **Vertical: Agro** (select novo no formulário, default Clínica), e-mail/senha do gestor
2. Colar URL/token da instância UAZAPI deles (WhatsApp próprio da Agrokhan)
3. Colar prompt do Pedro versão "vendedor consultivo de implementos" (editor de prompt por tenant já existe)
4. Cadastrar vendedores e produtos → entregar `agrokhan.orrin.com`

Badge do vertical na lista de tenants do admin.

## 10. Não-regressão da clínica

- Tenant novo sem vertical explícito = `'clinica'` → comportamento **idêntico** ao de hoje (sidebar, telas, tools do Pedro, métricas).
- Regra de código: onde o comportamento diverge, o código faz *branch* por vertical; nunca se altera o caminho da clínica.
- Suíte de testes atual (26 arquivos: agendamentos, marcações, timezone, webhook...) passa intacta em todo PR.
- Testes novos: gating (agro não acessa rotas/telas de clínica e vice-versa), seleção do tool set por vertical, CRUD produtos e despesas (incl. copiar-fixas e resumo por categoria), reuniões com campos novos (virtual exige link), dashboard/financeiro agro, kanban por status.

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Regressão da clínica em código compartilhado (Agenda, slots, dashboard) | Branch por vertical + suíte completa em todo PR |
| Fragmentação de categorias de despesa | Autocomplete + normalização ao salvar |
| `verificar_slots` acoplado a agendamentos/serviços | Tool agro própria (`verificar_slots_vendedores`) reusando a lógica de disponibilidade + bloqueios, sem tocar na tool da clínica |
| Cliente com recompra não cabe no kanban por status | Limitação aceita na v1; entidade Negócio é a evolução natural (fase 2) |

## 12. Fase 2 (fora da v1)

- Entidade **Negócio** (múltiplas negociações/recompra por cliente; kanban migra de status-do-cliente pra negócios)
- Login próprio por vendedor (role `vendedor`, vê só as reuniões dele)
- PDF de proposta/orçamento
- Preço interno de referência nos produtos
- Integração automática Google Meet/Calendar (v1: link colado manualmente)
- Múltiplos produtos de interesse por cliente
- Recorrência automática de despesas fixas
- Despesas habilitadas pro vertical clínica
