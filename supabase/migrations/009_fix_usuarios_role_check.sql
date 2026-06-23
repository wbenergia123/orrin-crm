-- Corrige a constraint de role em usuarios, que só permitia 'admin' e
-- 'vendedor' (papéis do projeto antigo de prospecção B2B/Pedro). Toda a
-- área de clínica usa o papel 'secretaria', que hoje é rejeitado por
-- esta constraint — bloqueando a criação de usuários secretária em
-- produção, não só nos testes.

ALTER TABLE usuarios DROP CONSTRAINT usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'vendedor', 'secretaria', 'super_admin'));
