-- 026_vertical_agro.sql — Vertical Agro (spec 2026-07-14-vertical-agro-design.md)
-- Aditiva. Não altera o caminho da clínica — só adiciona colunas/tabelas.

-- ============================================================
-- 1. Vertical na organização
-- ============================================================
ALTER TABLE organizacoes ADD COLUMN vertical TEXT NOT NULL DEFAULT 'clinica'
  CHECK (vertical IN ('clinica', 'agro'));

-- ============================================================
-- 2. Funil agro no CHECK de pacientes.status (união clínica + agro)
-- ============================================================
ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_status_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_status_check
  CHECK (status IN (
    'novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio',
    'reuniao_agendada', 'orcamento_enviado', 'negociacao', 'fechado', 'perdido'
  ));

-- ============================================================
-- 3. Catálogo de produtos (implementos) — sem preço
--    Criada ANTES dos ALTERs de pacientes (FK produto_interesse_id)
-- ============================================================
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

-- ============================================================
-- 4. Campos agro no paciente (nullable — clínica ignora)
-- ============================================================
ALTER TABLE pacientes ADD COLUMN produto_interesse_id UUID REFERENCES produtos(id);
ALTER TABLE pacientes ADD COLUMN valor_estimado NUMERIC;
ALTER TABLE pacientes ADD COLUMN valor_fechado NUMERIC;
ALTER TABLE pacientes ADD COLUMN data_fechamento DATE;
ALTER TABLE pacientes ADD COLUMN cidade TEXT;
ALTER TABLE pacientes ADD COLUMN atividade TEXT;
ALTER TABLE pacientes ADD COLUMN maquinas TEXT;

-- ============================================================
-- 5. Reuniões agro (recriação limpa; a reunioes de 001 é legado sem consumidor)
-- ============================================================
CREATE TABLE reunioes_agro (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id     UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  profissional_id UUID REFERENCES profissionais(id),
  data_hora       TIMESTAMP NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'presencial' CHECK (tipo IN ('presencial', 'virtual')),
  link_reuniao    VARCHAR(500),
  local           TEXT,
  status          VARCHAR(50) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
  notas           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_reunioes_agro_tenant_data ON reunioes_agro(tenant_id, data_hora);

-- ============================================================
-- 6. Despesas (vertical-agnóstica: tenant + dinheiro)
-- ============================================================
CREATE TABLE despesas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES organizacoes(id),
  descricao  TEXT NOT NULL,
  categoria  TEXT NOT NULL,
  valor      NUMERIC NOT NULL,
  data       DATE NOT NULL,
  fixa       BOOLEAN DEFAULT FALSE,
  notas      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_despesas_tenant_data ON despesas(tenant_id, data);

-- ============================================================
-- 7. RLS — mesmo padrão inline da 003 (auth.tenant_id() dá erro de permissão no SQL Editor)
-- ============================================================
ALTER TABLE produtos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes_agro ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON produtos
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON reunioes_agro
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON despesas
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');
