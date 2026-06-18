export type StatusPaciente = 'novo' | 'em_conversa' | 'consulta_agendada' | 'cliente' | 'frio'
export type StatusAgendamento = 'agendado' | 'confirmado' | 'cancelado' | 'concluido'

export interface Paciente {
  id: string
  telefone: string
  nome: string | null
  email: string | null
  cpf: string | null
  status: StatusPaciente
  ultimo_contato_at: string | null
  created_at: string
  updated_at: string
}

export interface Servico {
  id: string
  nome: string
  preco: number
  duracao_minutos: number
  ativo: boolean
}

export interface Profissional {
  id: string
  nome: string
  ativo: boolean
}

export interface Agendamento {
  id: string
  paciente_id: string
  servico_id: string
  profissional_id: string
  data_hora: string
  status: StatusAgendamento
  notas: string | null
  servico?: { id: string; nome: string; preco: number }
  profissional?: { id: string; nome: string }
  paciente?: { id: string; nome: string | null; telefone: string }
}

export interface Conversa {
  id: string
  paciente_id: string
  mensagem_paciente: string | null
  mensagem_agente: string | null
  tipo_remetente: 'agente' | 'humano'
  modo_humano: boolean
  created_at: string
}
