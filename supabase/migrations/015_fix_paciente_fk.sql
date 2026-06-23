-- As tabelas de Marcação Digital foram criadas (migrations 004/005) antes da
-- tabela "pacientes" existir, e ficaram apontando pra "clientes" — tabela
-- antiga do projeto B2B anterior, hoje vazia. Isso bloqueia silenciosamente
-- toda a feature: nenhuma sessão, marcação ou foto consegue ser salva.

ALTER TABLE atendimentos DROP CONSTRAINT atendimentos_paciente_id_fkey;
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE fotos_paciente DROP CONSTRAINT fotos_paciente_paciente_id_fkey;
ALTER TABLE fotos_paciente ADD CONSTRAINT fotos_paciente_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE injection_markings DROP CONSTRAINT injection_markings_paciente_id_fkey;
ALTER TABLE injection_markings ADD CONSTRAINT injection_markings_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;
