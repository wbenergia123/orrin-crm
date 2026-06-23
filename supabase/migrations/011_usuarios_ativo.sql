-- Adiciona flag ativo em usuarios para permitir bloquear login
-- sem precisar deletar o usuario.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- Garante que usuarios existentes continuem ativos.
UPDATE usuarios SET ativo = true WHERE ativo IS NULL;
