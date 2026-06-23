-- Adiciona suporte a foto real de profissional (até então só avatar
-- gerado automaticamente via pravatar.cc/ui-avatars no frontend).

ALTER TABLE profissionais ADD COLUMN foto_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-profissionais', 'fotos-profissionais', true)
ON CONFLICT DO NOTHING;
