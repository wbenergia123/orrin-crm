-- Nova regra de follow-up: aviso no dia, no horário fixo configurado,
-- pra agendamentos confirmados de hoje que ainda não aconteceram.

INSERT INTO followup_regras (tenant_id, nome, gatilho, horario_fixo, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'Lembrete do dia',
  'lembrete_dia',
  '08:00',
  'Oi [nome], hoje você tem [servico] às [hora] com [profissional]. Te esperamos!',
  true,
  12
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r WHERE r.tenant_id = o.id AND r.gatilho = 'lembrete_dia'
  );
