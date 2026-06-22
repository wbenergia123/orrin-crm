-- Migra configuracoes para modelo chave/valor por tenant.
-- Preserva dados antigos mapeando colunas da tabela anterior para chaves.
ALTER TABLE IF EXISTS configuracoes RENAME TO configuracoes_old;

CREATE TABLE configuracoes (
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

CREATE INDEX IF NOT EXISTS idx_configuracoes_tenant_chave ON configuracoes(tenant_id, chave);

-- Migra dados legados, se existirem
INSERT INTO configuracoes (tenant_id, chave, valor)
SELECT tenant_id, 'nome_clinica', empresa_nome FROM configuracoes_old WHERE empresa_nome IS NOT NULL
UNION ALL
SELECT tenant_id, 'telefone_clinica', telefone FROM configuracoes_old WHERE telefone IS NOT NULL
UNION ALL
SELECT tenant_id, 'prompt_ana', prompt_pedro FROM configuracoes_old WHERE prompt_pedro IS NOT NULL
UNION ALL
SELECT tenant_id, 'email_contato', email_contato FROM configuracoes_old WHERE email_contato IS NOT NULL
ON CONFLICT (tenant_id, chave) DO UPDATE SET
  valor = EXCLUDED.valor,
  updated_at = now();

DROP TABLE IF EXISTS configuracoes_old;
