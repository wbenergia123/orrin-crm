-- Criação/ajuste das tabelas da Clínica Estética (idempotente)
-- Use esta migration se a 006 falhou por tabela já existir.

CREATE TABLE IF NOT EXISTS pacientes (
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

CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone ON pacientes(tenant_id, telefone);
CREATE INDEX IF NOT EXISTS idx_pacientes_status ON pacientes(tenant_id, status);

CREATE TABLE IF NOT EXISTS servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  nome VARCHAR(255) NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  duracao_minutos INT NOT NULL DEFAULT 60,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicos_tenant ON servicos(tenant_id);

CREATE TABLE IF NOT EXISTS profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  nome VARCHAR(255) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profissionais_tenant ON profissionais(tenant_id);

CREATE TABLE IF NOT EXISTS agendamentos (
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

CREATE INDEX IF NOT EXISTS idx_agendamentos_tenant ON agendamentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(tenant_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente ON agendamentos(tenant_id, paciente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional ON agendamentos(tenant_id, profissional_id);

CREATE TABLE IF NOT EXISTS atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  data_atendimento TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_tenant ON atendimentos(tenant_id);

CREATE TABLE IF NOT EXISTS conversas_pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  mensagem_paciente TEXT,
  mensagem_agente TEXT,
  tipo_remetente VARCHAR(50) NOT NULL CHECK (tipo_remetente IN ('agente', 'humano')),
  modo_humano BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversas_pacientes_tenant ON conversas_pacientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversas_pacientes_paciente ON conversas_pacientes(tenant_id, paciente_id);

-- Garante colunas caso a tabela já exista com schema antigo
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizacoes(id);
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS paciente_id UUID REFERENCES pacientes(id);
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS data_atendimento TIMESTAMP;
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado'));
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- RLS (idempotente)
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas_pacientes ENABLE ROW LEVEL SECURITY;
