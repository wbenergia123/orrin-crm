-- Tabelas da Clínica Estética (multi-tenant)

CREATE TABLE pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  telefone VARCHAR(20) NOT NULL,
  nome VARCHAR(255),
  email VARCHAR(255),
  cpf VARCHAR(20),
  status VARCHAR(50) DEFAULT 'novo' CHECK (status IN ('novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio')),
  ultimo_contato_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pacientes_tenant ON pacientes(tenant_id);
CREATE INDEX idx_pacientes_telefone ON pacientes(tenant_id, telefone);
CREATE INDEX idx_pacientes_status ON pacientes(tenant_id, status);

CREATE TABLE servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  nome VARCHAR(255) NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  duracao_minutos INT NOT NULL DEFAULT 60,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_servicos_tenant ON servicos(tenant_id);

CREATE TABLE profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  nome VARCHAR(255) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_profissionais_tenant ON profissionais(tenant_id);

CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  servico_id UUID NOT NULL REFERENCES servicos(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  data_hora TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'agendado' CHECK (status IN ('agendado', 'confirmado', 'cancelado', 'concluido')),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agendamentos_tenant ON agendamentos(tenant_id);
CREATE INDEX idx_agendamentos_data ON agendamentos(tenant_id, data_hora);
CREATE INDEX idx_agendamentos_paciente ON agendamentos(tenant_id, paciente_id);
CREATE INDEX idx_agendamentos_profissional ON agendamentos(tenant_id, profissional_id);

CREATE TABLE atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  data_atendimento TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_atendimentos_tenant ON atendimentos(tenant_id);

CREATE TABLE conversas_pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  mensagem_paciente TEXT,
  mensagem_agente TEXT,
  tipo_remetente VARCHAR(50) NOT NULL CHECK (tipo_remetente IN ('agente', 'humano')),
  modo_humano BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversas_pacientes_tenant ON conversas_pacientes(tenant_id);
CREATE INDEX idx_conversas_pacientes_paciente ON conversas_pacientes(tenant_id, paciente_id);

-- RLS (o backend usa service role, mas habilitamos por padrão)
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas_pacientes ENABLE ROW LEVEL SECURITY;
