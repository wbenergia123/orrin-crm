-- Liga foto à sessão (atendimento) em que foi tirada, quando aplicável.
ALTER TABLE fotos_paciente ADD COLUMN visit_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL;
CREATE INDEX idx_fotos_paciente_visit ON fotos_paciente(visit_id);
