CREATE TABLE bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  data_hora_inicio TIMESTAMP NOT NULL,
  data_hora_fim TIMESTAMP NOT NULL,
  motivo VARCHAR(255),
  created_by UUID REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT bloqueio_periodo_valido CHECK (data_hora_fim > data_hora_inicio)
);

CREATE INDEX idx_bloqueios_tenant ON bloqueios_agenda(tenant_id);
CREATE INDEX idx_bloqueios_profissional ON bloqueios_agenda(tenant_id, profissional_id);
ALTER TABLE bloqueios_agenda ENABLE ROW LEVEL SECURITY;
