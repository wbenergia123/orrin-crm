-- Permite imagens de referência "globais" (tenant_id NULL), visíveis em todas as
-- clínicas — ex: rosto masculino padrão, reaproveitado em todas, sem duplicar arquivo.
-- Continua não sendo possível pra uma clínica comum CRIAR uma entrada global (só
-- super_admin ou inserção direta via service role).

ALTER TABLE imagens_referencia ALTER COLUMN tenant_id DROP NOT NULL;

DROP POLICY IF EXISTS "tenant_isolation" ON imagens_referencia;
CREATE POLICY "tenant_isolation" ON imagens_referencia
  USING (
    tenant_id IS NULL
    OR tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'super_admin'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'super_admin'
  );
