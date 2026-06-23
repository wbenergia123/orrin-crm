-- Follow-up automático por clínica

-- Adiciona data de nascimento para futura feature de aniversário
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS data_nascimento DATE;

-- Tabela de regras de follow-up por clínica
CREATE TABLE IF NOT EXISTS followup_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  gatilho TEXT NOT NULL,
  delay_minutos INT,
  horario_fixo TIME,
  template TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem_prioridade INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_regras_tenant ON followup_regras(tenant_id);

-- Tabela de envios realizados (evita duplicidade e guarda histórico)
CREATE TABLE IF NOT EXISTS followup_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  regra_id UUID NOT NULL REFERENCES followup_regras(id) ON DELETE CASCADE,
  agendamento_id UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
  mensagem TEXT NOT NULL,
  enviado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_envios_tenant ON followup_envios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_followup_envios_paciente ON followup_envios(paciente_id);
CREATE INDEX IF NOT EXISTS idx_followup_envios_regra ON followup_envios(regra_id, agendamento_id);
CREATE INDEX IF NOT EXISTS idx_followup_envios_enviado_em ON followup_envios(enviado_em);

-- Insere regras padrão para clínicas existentes
INSERT INTO followup_regras (tenant_id, nome, gatilho, delay_minutos, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'Lembrete 24h',
  'lembrete_agendamento',
  24 * 60,
  'Oi [nome], amanhã você tem [servico] às [hora]. Confirma?',
  true,
  10
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r WHERE r.tenant_id = o.id AND r.gatilho = 'lembrete_agendamento'
  );

INSERT INTO followup_regras (tenant_id, nome, gatilho, delay_minutos, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'Não respondeu',
  'nao_respondeu',
  60,
  'Oi [nome], vi que você entrou em contato. Ainda tem interesse em marcar?',
  true,
  5
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r WHERE r.tenant_id = o.id AND r.gatilho = 'nao_respondeu'
  );

INSERT INTO followup_regras (tenant_id, nome, gatilho, delay_minutos, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'No-show',
  'no_show',
  30,
  'Oi [nome], vi que não conseguiu vir hoje. Quer remarcar?',
  true,
  8
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r WHERE r.tenant_id = o.id AND r.gatilho = 'no_show'
  );
