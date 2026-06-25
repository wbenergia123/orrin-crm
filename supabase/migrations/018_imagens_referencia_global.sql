-- Imagens de referência com tenant_id NULL são visíveis para todas as clínicas

DROP POLICY IF EXISTS "tenant_isolation" ON imagens_referencia;

CREATE POLICY "tenant_isolation" ON imagens_referencia
  USING      (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR tenant_id IS NULL
    OR (auth.jwt() ->> 'role') = 'super_admin'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'super_admin'
  );
