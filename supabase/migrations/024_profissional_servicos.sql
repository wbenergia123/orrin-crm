CREATE TABLE profissional_servicos (
  profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  servico_id      UUID NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES organizacoes(id),
  PRIMARY KEY (profissional_id, servico_id)
);

CREATE INDEX idx_prof_servicos_tenant    ON profissional_servicos(tenant_id);
CREATE INDEX idx_prof_servicos_profissional ON profissional_servicos(profissional_id);
CREATE INDEX idx_prof_servicos_servico   ON profissional_servicos(servico_id);
ALTER TABLE profissional_servicos ENABLE ROW LEVEL SECURITY;
