-- Configurações por tenant
CREATE TABLE IF NOT EXISTS configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chave)
);

ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS configuracoes_tenant ON configuracoes;
CREATE POLICY configuracoes_tenant ON configuracoes
  FOR ALL
  USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

-- Índice
CREATE INDEX IF NOT EXISTS idx_configuracoes_tenant_chave ON configuracoes(tenant_id, chave);
