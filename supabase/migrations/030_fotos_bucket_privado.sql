-- Fecha o bucket de fotos de paciente: dado médico sensível (LGPD) não pode ficar
-- acessível por link público. O backend passa a servir URLs assinadas de curta duração.
-- Migration 004 criou o bucket como público (getPublicUrl); aqui ele vira privado.
UPDATE storage.buckets SET public = false WHERE id = 'fotos-pacientes';

-- A leitura/escrita continua só pelo backend (service role, que ignora RLS).
-- A policy antiga liberava acesso amplo por bucket; restringe a quem tem sessão do tenant dono
-- do arquivo (o caminho começa com "<tenant_id>/"). Não afeta o service role.
DROP POLICY IF EXISTS "fotos_tenant_access" ON storage.objects;
CREATE POLICY "fotos_tenant_isolation" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'fotos-pacientes'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'fotos-pacientes'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
