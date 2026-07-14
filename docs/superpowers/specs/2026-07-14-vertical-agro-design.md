# Vertical Agro (tenant Agrokhan) — Orrin CRM

**Data:** 2026-07-14
**Status:** Em avaliação (rev. 2 — corrigida após revisão de código: agro roda sobre `pacientes`, não sobre a tabela vestigial `clientes`)
**Decisão base:** NÃO clonar o repo. A Agrokhan entra como tenant do vertical `agro` no mesmo codebase multi-tenant.

---

## 1. Contexto

**Cliente:** Agrokhan Implementos (agrokhan.com.br) — fabricante B2B de implementos agrícolas personalizados (Cascavel-PR). Venda consultiva: lead chama no WhatsApp, pede orçamento customizado, reunião (presencial ou virtual) com vendedor, fecha negócio. Terão **vários vendedores**.

**Por que tenant e não clone:** o Orrin já é multi-tenant (spec 2026-06-15: `tenant_id` + RLS + subdomínio via Vercel wildcard). Clone = manutenção dupla pra sempre (todo fix de webhook/auth/agente aplicado 2x).

**Realidade do código (verificada):** o caminho vivo do produto roda inteiro sobre `pacientes` + `conversas_pacientes`:

- `webhook.ts` faz lookup/criação de lead em `pacientes` e grava em `conversas_pacientes` (zero menções a `clientes`)
- O agente vivo é `backend/src/lib/claude-agent.ts` (`processarComAgente`); `backend/src/agents/pedro.ts` é código morto (nenhum import)
- Handoff (`atendimentos.ts`), follow-up (`followup-runner.ts`), dashboard e financeiro rodam sobre `pacientes`/`conversas_pacientes`/`agendamentos`
- O frontend não chama `/api/clientes` nem `/api/reunioes`; a página `Clientes.tsx` já consome `GET /pacientes` (rótulo ≠ tabela é o padrão da casa)
- O kanban de pipeline já existe: `Pacientes.tsx` (item "Pipeline" da sidebar), drag → `PATCH /pacientes/:id/status`
- Tabelas `clientes`, `conversas` e a `reunioes` original são **legado vestigial** do Orrin B2B de junho, sem consumidor

**Decisão estrutural:** o vertical agro roda sobre `pacientes` com rótulo "Clientes"/"Leads" no frontend. Webhook, agente, handoff, follow-up, atendimentos e kanban funcionam sem religação. O legado vestigial vira candidato a limpeza (seção 12).

## 2. Decisões finais

| Tema | Decisão |
|------|---------|
| Estratégia | Mesmo repo, tenant `agrokhan` com vertical `agro` |
| Gating | Coluna `vertical TEXT NOT NULL DEFAULT 'clinica'` em `organizacoes` (`'clinica'` \| `'agro'`); `studio_3d_ativo` continua toggle separado |
| Entidade do lead agro | **`pacientes`** (caminho quente já pronto), rótulo por vertical no frontend |
| Pipeline v1 | Kanban existente (`Pacientes.tsx`) com colunas configuradas por vertical — sem entidade Negócio; 1 negociação por cliente por vez |
| Funil agro | `novo → em_conversa → reuniao_agendada → orcamento_enviado → negociacao → fechado \| perdido`. Reutiliza `novo` e `em_conversa`, que o webhook já grava — código quente sem branch |
| Vendedores | Reaproveitam módulo Profissionais (rótulo por vertical). Só cadastro, **sem login próprio** |
| Bloqueios | Ficam — férias/folga do vendedor, mesma tela, rótulo acompanha |
| Produtos | Catálogo **sem preço** (venda por orçamento; agente nunca fala preço) |
| Reuniões | Tabela `reunioes` **recriada limpa** (a atual não tem consumidor): `paciente_id`, tipo presencial/virtual, `link_reuniao`, local, vendedor |
| Escopo v1 | Completo: gating + admin + vendedores + reuniões/agenda + produtos + kanban agro + agente agro + **Dashboard e Financeiro adaptados** |
| Financeiro agro | Receitas (fechamentos) + **despesas completas** (funcionário, aluguel, combustível, marketing, ADS...) + resultado do período |
| Não-regressão | Mudança em código compartilhado é aditiva ou ramificada por vertical; caminho da clínica nunca é alterado. Suíte atual (25 arquivos de teste) passa intacta em todo PR |

## 3. Módulos por vertical

### Escondidos no vertical agro (nada é deletado do código)

Ficha do Paciente (versão clínica), Agendamentos de consulta, Serviços, Injetáveis, Marcação Digital, Simulações/Studio 3D, Imagens de referência.

### Core compartilhado (já roda sobre `pacientes` — funciona como está)

Auth multi-tenant, webhook UAZAPI, agente (`claude-agent.ts`), Atendimentos (handoff bot↔humano), Follow-up automático, páginas Pipeline (kanban) e Clientes (lista), Configurações, Admin/Impersonar.

### Adaptados (ramificação por vertical, caminho clínica intocado)

| Módulo | Mudança no vertical agro |
|--------|--------------------------|
| Pipeline (`Pacientes.tsx`) | Colunas do kanban por vertical (funil agro acima); card mostra produto de interesse, valor estimado e vendedor da próxima reunião |
| Clientes (lista) | Campos agro na ficha (cidade, atividade, máquinas, produto de interesse, valores) |
| Profissionais | Rótulo "Vendedores"; sem vínculo com serviços |
| Bloqueios | Igual — bloqueia agenda do vendedor (férias, folga) |
| Agenda | react-big-calendar mostra reuniões por vendedor (em vez de consultas) |
| Agente | Prompt por tenant (já existe no admin) + **tool set E context-builder por vertical** (seção 5) |
| Dashboard | Métricas de funil de venda (seção 8) |
| Financeiro | Receitas + despesas + resultado (seção 7) |

### Novos

Produtos, Despesas (vertical-agnóstica), Reuniões (recriada).

### Legado vestigial (documentado; limpeza na seção 12)

Tabelas `clientes` e `conversas`, rota `clientes.ts`, `agents/pedro.ts`, `reunioes` original.

## 4. Database (migrations aditivas, todas com RLS por tenant)

```sql
-- Vertical na organização
ALTER TABLE organizacoes ADD COLUMN vertical TEXT NOT NULL DEFAULT 'clinica'
  CHECK (vertical IN ('clinica', 'agro'));

-- Funil agro no CHECK de pacientes.status (união clínica + agro)
ALTER TABLE pacientes DROP CONSTRAINT pacientes_status_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_status_check
  CHECK (status IN (
    'novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio',        -- clínica (atual)
    'reuniao_agendada', 'orcamento_enviado', 'negociacao', 'fechado', 'perdido'  -- agro
  ));

-- Catálogo de produtos (implementos) — sem preço
-- (criada ANTES dos ALTERs de pacientes: produto_interesse_id referencia esta tabela)
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

-- Campos agro no paciente (nullable — clínica ignora)
ALTER TABLE pacientes ADD COLUMN produto_interesse_id UUID REFERENCES produtos(id);
ALTER TABLE pacientes ADD COLUMN valor_estimado NUMERIC;
ALTER TABLE pacientes ADD COLUMN valor_fechado NUMERIC;
ALTER TABLE pacientes ADD COLUMN data_fechamento DATE;
ALTER TABLE pacientes ADD COLUMN cidade TEXT;
ALTER TABLE pacientes ADD COLUMN atividade TEXT;      -- soja, milho, pecuária...
ALTER TABLE pacientes ADD COLUMN maquinas TEXT;       -- texto livre: trator/colheitadeira que possui

-- Reuniões: recriação limpa (a tabela original de 001 não tem consumidor —
-- nenhuma tela ou serviço lê/escreve nela; o legado é dropado na limpeza, seção 12)
CREATE TABLE reunioes_agro (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id     UUID NOT NULL REFERENCES pacientes(id),
  profissional_id UUID REFERENCES profissionais(id),   -- vendedor responsável
  data_hora       TIMESTAMP NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'presencial' CHECK (tipo IN ('presencial', 'virtual')),
  link_reuniao    VARCHAR(500),                         -- obrigatório se virtual (validação na API)
  local           TEXT,
  status          VARCHAR(50) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
  notas           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_reunioes_agro_tenant_data ON reunioes_agro(tenant_id, data_hora);

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

RLS: mesmas policies por tenant das tabelas existentes, aplicadas a `produtos`, `reunioes_agro` e `despesas`.

Notas de correção (rev. 2): a spec anterior propunha `ADD COLUMN notas` em `reunioes` (já existe desde 001:32) e `link_video` (redundante com `link_reuniao`, 001:33); e o funil agro estourava os CHECKs de status existentes (`clientes.status` 001:20, `pacientes.status` 007:11). Corrigido acima.

## 5. Backend

- **Admin:** `POST/PATCH /admin/tenants` aceita `vertical`. Login/token injeta `vertical` no payload do usuário (mesmo caminho de `tenant_id`/`role`/`studio_3d_ativo`).
- **Webhook, handoff, follow-up:** intocados — já rodam sobre `pacientes`/`conversas_pacientes` e servem os dois verticais. O webhook gravar `em_conversa` é etapa legítima do funil agro (por isso a reutilização do status).
- **`produtos.ts`** (novo): CRUD, estruturalmente clone de `servicos.ts`.
- **`despesas.ts`** (novo): CRUD + `GET /despesas/resumo?de=&ate=` (soma por categoria) + `POST /despesas/copiar-fixas` (duplica as `fixa = true` do mês anterior pro mês atual).
- **`reunioes-agro.ts`** (novo): CRUD sobre `reunioes_agro`; validação `tipo = 'virtual'` exige `link_reuniao`; criar reunião move o paciente pra `reuniao_agendada`.
- **Agente por vertical — duas ramificações em `claude-agent.ts`/`claude-tools.ts`:**
  1. **Tool set** (registry selecionado pelo vertical do tenant):
     - *Clínica:* set atual, intocado.
     - *Agro:* `atualizar_cliente` (nome, cidade, atividade, máquinas), `listar_produtos`, `registrar_interesse` (produto), `verificar_slots_vendedores`, `criar_reuniao` (tipo, vendedor), `remarcar_reuniao`, `cancelar_reuniao`.
  2. **Context-builder**: hoje o `processarComAgente` injeta `servicos`, `profissionais`, `profissional_servicos` e `agendamentos` no system prompt — conteúdo de clínica. No vertical agro, o contexto injeta produtos, vendedores e reuniões do paciente. Sem essa ramificação, o prompt do tenant agro receberia catálogo de clínica.
  - `verificar_slots_vendedores`: a lógica atual de `executarVerificarSlots` (~110 linhas) mistura disponibilidade com `servicos`/`profissional_servicos` — exige **extração** da parte de disponibilidade+bloqueios pra função comum, não reuso direto. Trabalho de refatoração consciente, com a suíte atual garantindo a clínica.
- **`dashboard.ts` / `financeiro.ts`:** ramificam por vertical do tenant (seções 7 e 8).

## 6. Frontend

- `usuario.vertical` disponível via `useAuth` (vem do token).
- **`VerticalRoute`** (~5 linhas): wrapper de rotas; vertical errado → `<Navigate to="/dashboard" />`. Rotas de clínica agrupadas sob `vertical="clinica"`, rotas agro sob `vertical="agro"`.
- **Sidebar:** itens ganham `vertical?`; filtro em `visibleItems` (uma linha a mais no filtro existente). Rótulos por vertical: "Profissionais"→"Vendedores". Sidebar agro: Dashboard, Pipeline, Clientes, Produtos, Vendedores, Agenda, Atendimentos, Financeiro, Configurações.
- **Pipeline agro = `Pacientes.tsx` adaptada**, não tela nova: colunas do kanban viram config por vertical; card agro mostra produto de interesse, valor estimado e vendedor da próxima reunião. Arrastar pra "fechado" abre prompt do `valor_fechado`.
- **Clientes (lista)**: `Clientes.tsx` já consome `/pacientes` — pro agro só ganha os campos novos na ficha.
- **Telas novas:** Produtos (clone de Serviços: nome, categoria, foto, descrição, ativo).
- **Adaptadas:** Agenda (reuniões por vendedor; modal com tipo presencial/virtual, link, local, vendedor), Dashboard e Financeiro (por vertical).

Esconder menu é UX; a segurança de dados já existe via RLS por `tenant_id`.

## 7. Financeiro agro

Três blocos, filtráveis por período (mês/ano):

1. **Receitas** — fechamentos do pipeline (`valor_fechado` por `data_fechamento`): total do período e por vendedor.
2. **Despesas** — CRUD completo (funcionário, aluguel, combustível, marketing, ADS, impostos, manutenção...):
   - **Categoria é texto livre com autocomplete**: sugere as categorias já usadas pelo tenant (`SELECT DISTINCT categoria`) + sugestões de fábrica. Normalização ao salvar (trim + capitalização) pra "ADS", "ads " e "Ads" não virarem três categorias.
   - **Gráfico por categoria**: qualquer categoria digitada aparece automaticamente no gráfico do período (agrupamento é `GROUP BY categoria`). Clicar numa fatia filtra a lista de despesas abaixo.
   - **Botão "Copiar fixas do mês anterior"**: duplica as despesas `fixa = true` pro mês atual (salário, aluguel), só ajustar o que mudou. Recorrência automática fica pra fase 2.
3. **Resultado** — DRE simplificado: receita − despesa do período (faturou X, gastou Y, sobrou Z).

O financeiro da clínica roda sobre `agendamentos`+`servicos.preco` e permanece intocado; receita agro via `valor_fechado` é caminho paralelo limpo. `despesas` nasce vertical-agnóstica; na v1 só aparece no Financeiro agro. Ligar pras clínicas é decisão futura sem retrabalho.

## 8. Dashboard agro

- Leads novos no período
- Reuniões da semana (por vendedor)
- Taxa de conversão lead→reunião e reunião→fechamento
- Valor fechado no mês

## 9. Admin — fluxo de onboarding da Agrokhan

1. Criar tenant: slug `agrokhan`, **Vertical: Agro** (select novo no formulário, default Clínica), e-mail/senha do gestor
2. Colar URL/token da instância UAZAPI deles (WhatsApp próprio da Agrokhan)
3. Colar prompt do agente versão "vendedor consultivo de implementos" (editor de prompt por tenant já existe — campo `prompt_pedro` em `configuracoes`)
4. Cadastrar vendedores e produtos → entregar `agrokhan.orrin.com`

Badge do vertical na lista de tenants do admin.

## 10. Não-regressão da clínica

- Tenant novo sem vertical explícito = `'clinica'` → comportamento **idêntico** ao de hoje (sidebar, telas, tools do agente, métricas).
- Regra de código: onde o comportamento diverge, o código faz *branch* por vertical; nunca se altera o caminho da clínica.
- Suíte de testes atual (25 arquivos: agendamentos, marcações, timezone, webhook...) passa intacta em todo PR.
- Testes novos: gating (agro não acessa rotas/telas de clínica e vice-versa), seleção de tool set E context-builder por vertical, CRUD produtos e despesas (incl. copiar-fixas e resumo por categoria), reuniões agro (virtual exige link; criar move status), kanban com colunas por vertical, dashboard/financeiro agro.

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Regressão da clínica em código compartilhado (kanban, agente, dashboard) | Branch por vertical + suíte completa em todo PR |
| Context-builder do agente injetar conteúdo de clínica no tenant agro | Ramificação explícita do contexto por vertical (seção 5) + teste dedicado |
| Extração da lógica de disponibilidade (`executarVerificarSlots`) quebrar slots da clínica | Refatoração coberta pelos testes existentes de agendamento/slots antes de escrever a versão agro |
| Fragmentação de categorias de despesa | Autocomplete + normalização ao salvar |
| Cliente com recompra não cabe no kanban por status | Limitação aceita na v1; entidade Negócio é a evolução natural (fase 2) |

## 12. Fase 2 e limpeza (fora da v1)

**Limpeza de legado vestigial** (candidatos verificados sem consumidor): dropar tabelas `clientes` e `conversas`, remover `agents/pedro.ts`, rota `clientes.ts` e a tabela `reunioes` original (001). Fazer como PR separado da v1, com verificação de uso em produção antes do drop.

**Fase 2:**
- Entidade **Negócio** (múltiplas negociações/recompra por cliente; kanban migra de status-do-paciente pra negócios)
- Login próprio por vendedor (role `vendedor`, vê só as reuniões dele)
- PDF de proposta/orçamento
- Preço interno de referência nos produtos
- Integração automática Google Meet/Calendar (v1: link colado manualmente)
- Múltiplos produtos de interesse por cliente
- Recorrência automática de despesas fixas
- Despesas habilitadas pro vertical clínica
- Renomear `pacientes` pra entidade neutra (`contatos`/`leads`) se o desconforto do nome interno justificar a migração
