-- supabase/migrations/001_schema_orrin.sql

-- Tabela: usuarios
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin', 'vendedor')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela: clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(255),
  empresa VARCHAR(255),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'novo' CHECK (status IN ('novo', 'contato_feito', 'reuniao_agendada', 'cliente', 'perdido')),
  ultimo_contato_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela: reunioes
CREATE TABLE reunioes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_hora TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
  notas TEXT,
  link_reuniao VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(cliente_id, data_hora)
);

-- Tabela: conversas
CREATE TABLE conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mensagem_cliente TEXT,
  mensagem_agente TEXT,
  tipo_remetente VARCHAR(50) NOT NULL CHECK (tipo_remetente IN ('agente', 'humano')),
  modo_humano BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela: configuracoes
CREATE TABLE configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_nome VARCHAR(255) NOT NULL,
  email_contato VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  prompt_pedro TEXT,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  whatsapp_conectado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_clientes_telefone ON clientes(telefone);
CREATE INDEX idx_clientes_status ON clientes(status);
CREATE INDEX idx_reunioes_cliente ON reunioes(cliente_id);
CREATE INDEX idx_reunioes_data ON reunioes(data_hora);
CREATE INDEX idx_conversas_cliente ON conversas(cliente_id);

-- RLS (Row Level Security) - habilitar para tabelas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
