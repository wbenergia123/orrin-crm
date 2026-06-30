-- Suporte a serviços que requerem avaliação presencial e ocultam o preço
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS requer_avaliacao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS ocultar_preco BOOLEAN NOT NULL DEFAULT FALSE;
