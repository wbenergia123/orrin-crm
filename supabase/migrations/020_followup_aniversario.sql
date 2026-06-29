INSERT INTO followup_regras (tenant_id, nome, gatilho, horario_fixo, template, ativo, ordem_prioridade)
SELECT
  o.id,
  'Aniversário',
  'aniversario',
  '09:00',
  'Feliz aniversário, [nome]! 🎉 A equipe deseja um dia incrível! Para comemorar, que tal aproveitar pra cuidar de você?',
  true,
  15
FROM organizacoes o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM followup_regras r WHERE r.tenant_id = o.id AND r.gatilho = 'aniversario'
  );
