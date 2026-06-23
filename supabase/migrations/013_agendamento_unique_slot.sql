-- Evita dois agendamentos para o mesmo profissional no mesmo horário.
-- A proteção em código (checar antes de inserir, em claude-tools.ts) tem uma
-- janela de corrida: dois pacientes confirmando o mesmo horário ao mesmo tempo
-- podiam os dois conseguir marcar. O índice único parcial fecha essa janela —
-- agendamentos cancelados ficam de fora, então o horário libera normalmente.

CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_slot_unico
  ON agendamentos (tenant_id, profissional_id, data_hora)
  WHERE status != 'cancelado';
