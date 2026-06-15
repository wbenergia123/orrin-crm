-- supabase/migrations/002_seed.sql

-- Garantir que a extensão pgcrypto está habilitada para crypt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar usuário admin padrão (senha: senha123)
INSERT INTO usuarios (email, senha_hash, role)
VALUES (
  'admin@orrin.com',
  crypt('senha123', gen_salt('bf')),
  'admin'
);

-- Criar configuração padrão do Orrin
INSERT INTO configuracoes (empresa_nome, email_contato, telefone, prompt_pedro)
VALUES (
  'Orrin',
  'contato@orrin.com',
  NULL,
  'Você é Pedro, agente de prospecção da empresa Orrin. Seu objetivo é marcar uma reunião com o cliente. Seja amável, conciso e profissional. NUNCA mencione preço ou valores. Foque apenas em entender a necessidade e agendar uma reunião. Se o cliente não tiver tempo, peça para enviar uma mensagem depois.'
);
