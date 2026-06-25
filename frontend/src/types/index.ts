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
  foto_url: string | null
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

// ── Marcação Digital ──

export type CategoriaInjetavel =
  | 'botox' | 'filler' | 'pdo_wire' | 'bioestimulador'
  | 'bioremodelador' | 'skinbooster' | 'enzimas' | 'outro'

export type TipoDesenho = 'ponto' | 'linha' | 'forma'
export type BackgroundModo = 'anatomico' | 'foto_paciente' | 'imagem_referencia'

export type ViewType =
  | 'face_front' | 'face_left' | 'face_right'
  | 'body_front' | 'body_back'

export interface Injetavel {
  id: string
  tenant_id: string
  nome: string
  categoria: CategoriaInjetavel
  cor_hex: string
  unidade: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Atendimento {
  id: string
  tenant_id: string
  paciente_id: string
  reuniao_id: string | null
  profissional_id: string | null
  data_atendimento: string
  status: 'em_andamento' | 'concluido' | 'cancelado'
  notas: string | null
  background_modo: BackgroundModo
  background_foto_id: string | null
  background_imagem_id: string | null
  background_opacidade: number
  created_at: string
  updated_at: string
}

export interface InjectionMarking {
  id: string
  tenant_id: string
  paciente_id: string
  visit_id: string
  view_type: ViewType
  x: number
  y: number
  tipo_desenho: TipoDesenho
  pontos: { x: number; y: number }[] | null
  product_id: string
  quantity: number
  unit: string
  lot_id: string | null
  created_by: string | null
  created_at: string
  injetaveis?: { nome: string; cor_hex: string; categoria: CategoriaInjetavel; unidade: string }
}

export interface ImagemReferencia {
  id: string
  tenant_id: string
  nome: string
  url: string
  created_at: string
}

export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  visit_id: string | null
  created_at: string
}
