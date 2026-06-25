-- Marcação Digital v2: fundo customizável, ferramentas de desenho e imagens de referência

ALTER TABLE injection_markings
  ADD COLUMN tipo_desenho VARCHAR(10) NOT NULL DEFAULT 'ponto'
    CHECK (tipo_desenho IN ('ponto', 'linha', 'forma')),
  ADD COLUMN pontos JSONB;

COMMENT ON COLUMN injection_markings.tipo_desenho IS 'ponto (x/y), linha ou forma/area';
COMMENT ON COLUMN injection_markings.pontos IS 'array de {x,y} para linha/forma; null para ponto';

ALTER TABLE injetaveis DROP CONSTRAINT IF EXISTS injetaveis_categoria_check;
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

DROP POLICY IF EXISTS "tenant_isolation" ON imagens_referencia;
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
