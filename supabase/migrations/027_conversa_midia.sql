-- 027_conversa_midia.sql — Foto/vídeo do cliente via WhatsApp
-- Armazena URL da mídia recebida para exibir no painel. O agente NÃO analisa conteúdo.

ALTER TABLE conversas_pacientes
  ADD COLUMN midia_url TEXT,
  ADD COLUMN midia_tipo VARCHAR(10) CHECK (midia_tipo IN ('image', 'video'));
