-- supabase/migrations/004_estetica_base.sql
-- Tabelas de suporte para Marcação Digital: atendimentos, injetáveis e fotos do paciente

-- ============================================================
-- TABELA: atendimentos (visit_id para sessões de marcação)
-- ============================================================
CREATE TABLE atendimentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id     UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  reuniao_id      UUID REFERENCES reunioes(id) ON DELETE SET NULL,
  profissional_id UUID, -- FK pra profissionais quando/se a tabela existir
  data_atendimento TIMESTAMP DEFAULT NOW(),
  status          VARCHAR(50) DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  notas           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_atendimentos_tenant   ON atendimentos(tenant_id);
CREATE INDEX idx_atendimentos_paciente ON atendimentos(paciente_id);
CREATE INDEX idx_atendimentos_data     ON atendimentos(tenant_id, data_atendimento);

-- ============================================================
-- TABELA: injetaveis (produtos cadastrados pela clínica)
-- ============================================================
CREATE TABLE injetaveis (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES organizacoes(id),
  nome       VARCHAR(255) NOT NULL,
  categoria  VARCHAR(50) NOT NULL CHECK (categoria IN (
    'botox', 'filler', 'pdo_wire', 'bioestimulador', 'bioremodelador', 'skinbooster', 'outro'
  )),
  cor_hex    VARCHAR(7) NOT NULL DEFAULT '#f59e0b',
  unidade    VARCHAR(10) NOT NULL DEFAULT 'UI',
  ativo      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_injetaveis_tenant ON injetaveis(tenant_id);
CREATE INDEX idx_injetaveis_ativo  ON injetaveis(tenant_id, ativo);

-- Seed padrão de injetáveis: inserido por tenant ao criar a organização
-- (não inserimos aqui pois precisaria de tenant_id real)
-- Os injetáveis são criados via UI em Configurações > Injetáveis

-- ============================================================
-- TABELA: fotos_paciente (anexos de fotos do prontuário)
-- ============================================================
CREATE TABLE fotos_paciente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  tipo        VARCHAR(20) DEFAULT 'geral' CHECK (tipo IN ('antes', 'depois', 'geral')),
  legenda     VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fotos_tenant   ON fotos_paciente(tenant_id);
CREATE INDEX idx_fotos_paciente ON fotos_paciente(paciente_id);

-- ============================================================
-- RLS: ativar em todas as tabelas novas
-- ============================================================
ALTER TABLE atendimentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE injetaveis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_paciente ENABLE ROW LEVEL SECURITY;

-- Policies de isolamento por tenant (mesmo padrão das tabelas existentes)
CREATE POLICY "tenant_isolation" ON atendimentos
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON injetaveis
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

CREATE POLICY "tenant_isolation" ON fotos_paciente
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

-- ============================================================
-- STORAGE BUCKET: fotos-pacientes
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-pacientes', 'fotos-pacientes', true)
ON CONFLICT DO NOTHING;

-- Policy de storage: usuário só acessa arquivos do seu tenant
CREATE POLICY "fotos_tenant_access" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'fotos-pacientes'
    AND (auth.jwt() ->> 'tenant_id')::UUID = (
      SELECT tenant_id FROM fotos_paciente WHERE url LIKE '%' || name || '%'
      LIMIT 1
    )
  );
