-- Regra de follow-up pós-atendimento para todas as clínicas existentes
INSERT INTO followup_regras (tenant_id, nome, gatilho, delay_minutos, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'Pós-atendimento',
  'pos_atendimento',
  60,
  'Oi [nome]! 😊 Esperamos que tenha gostado do [servico] hoje. Ficamos à disposição sempre que precisar! 💛',
  false,
  6
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r
    WHERE r.tenant_id = o.id AND r.gatilho = 'pos_atendimento'
  );
