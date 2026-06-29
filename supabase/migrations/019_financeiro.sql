-- Custo de compra do injetável (pra calcular margem real por sessão na Marcação Digital)
ALTER TABLE injetaveis ADD COLUMN IF NOT EXISTS custo DECIMAL(10,2) DEFAULT 0;

-- % de comissão do profissional sobre os serviços que ele atende
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS comissao_percentual DECIMAL(5,2) DEFAULT 0
  CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100);
