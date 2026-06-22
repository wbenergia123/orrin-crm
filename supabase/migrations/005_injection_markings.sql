-- supabase/migrations/005_injection_markings.sql
-- Tabela de marcações de injetáveis no mapa facial/corporal

CREATE TABLE injection_markings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  visit_id    UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  view_type   VARCHAR(20) NOT NULL CHECK (view_type IN (
    'face_front', 'face_left', 'face_right', 'body_front', 'body_back'
  )),
  x           DECIMAL(5,2) NOT NULL CHECK (x >= 0 AND x <= 100),
  y           DECIMAL(5,2) NOT NULL CHECK (y >= 0 AND y <= 100),
  product_id  UUID NOT NULL REFERENCES injetaveis(id),
  quantity    DECIMAL(10,2) NOT NULL,
  unit        VARCHAR(10) NOT NULL DEFAULT 'UI',
  lot_id      VARCHAR(100),
  created_by  UUID REFERENCES usuarios(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_markings_tenant   ON injection_markings(tenant_id);
CREATE INDEX idx_markings_paciente ON injection_markings(paciente_id);
CREATE INDEX idx_markings_visit    ON injection_markings(visit_id);
CREATE INDEX idx_markings_view     ON injection_markings(visit_id, view_type);

-- RLS
ALTER TABLE injection_markings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON injection_markings
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');
