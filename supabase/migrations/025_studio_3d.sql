-- migrations/025_studio_3d.sql
-- Studio 3D: flag por clínica + simulações + bucket privado

ALTER TABLE organizacoes
  ADD COLUMN studio_3d_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN studio_3d_limite_creditos_mes INT NOT NULL DEFAULT 150;

CREATE TABLE simulacoes_3d (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id       UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  criado_por        UUID REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ DEFAULT now(),
  atualizado_em     TIMESTAMPTZ DEFAULT now(),

  meshy_task_id     TEXT,
  status            VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  creditos_consumidos INT DEFAULT 0,

  fotos_paths       TEXT[] NOT NULL DEFAULT '{}',
  modelo_glb_path   TEXT,
  thumbnail_path    TEXT,

  ancoras           JSONB NOT NULL DEFAULT '{}',
  sliders           JSONB NOT NULL DEFAULT '{}',
  screenshot_path   TEXT,
  notas             TEXT
);
CREATE INDEX idx_simulacoes_3d_tenant_paciente ON simulacoes_3d(tenant_id, paciente_id);

ALTER TABLE simulacoes_3d ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON simulacoes_3d
  USING      (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'super_admin');

-- Bucket PRIVADO (acesso só via signed URL geradas pelo backend)
INSERT INTO storage.buckets (id, name, public)
VALUES ('simulacoes-3d', 'simulacoes-3d', false)
ON CONFLICT (id) DO NOTHING;
