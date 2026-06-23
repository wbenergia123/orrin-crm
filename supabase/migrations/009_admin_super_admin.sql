-- Garante que o usuário admin padrão seja super_admin no painel admin.
UPDATE usuarios
SET role = 'super_admin'
WHERE email = 'admin@orrin.com';
