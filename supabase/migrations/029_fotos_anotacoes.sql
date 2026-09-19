-- Marcações livres (traços + rótulos) sobre uma foto do paciente, editáveis.
-- A foto original nunca é alterada; o app iOS desenha as anotações por cima.
-- Coordenadas normalizadas (0–1) relativas à imagem, independentes da tela:
-- { "tracos":  [{ "cor": "#FF3B30", "largura": 0.01, "pontos": [[x, y], ...] }],
--   "rotulos": [{ "texto": "Mama E", "cor": "#FFCC00", "x": 0.3, "y": 0.6 }] }
ALTER TABLE fotos_paciente ADD COLUMN IF NOT EXISTS anotacoes JSONB;
ALTER TABLE fotos_paciente ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
