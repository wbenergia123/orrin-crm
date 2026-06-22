// backend/src/types/index.ts

export type StatusCliente = 'novo' | 'contato_feito' | 'reuniao_agendada' | 'cliente' | 'perdido'
export type StatusReuniао = 'agendada' | 'confirmada' | 'cancelada' | 'realizada'
export type RoleUsuario = 'admin' | 'vendedor' | 'super_admin'
export type TipoRemetente = 'agente' | 'humano'

export interface Organizacao {
  id: string
  slug: string
  nome: string
  ativo: boolean
  deleted_at: string | null
  created_at: string
}

export interface Cliente {
  id: string
  tenant_id: string
  telefone: string
  nome: string | null
  empresa: string | null
  email: string | null
  status: StatusCliente
  ultimo_contato_at: string | null
  created_at: string
  updated_at: string
}

export interface Reuniao {
  id: string
  tenant_id: string
  cliente_id: string
  data_hora: string
  status: StatusReuniао
  notas: string | null
  link_reuniao?: string
  created_at: string
  updated_at: string
  cliente?: Cliente
}

export interface Conversa {
  id: string
  tenant_id: string
  cliente_id: string
  mensagem_cliente: string | null
  mensagem_agente: string | null
  tipo_remetente: TipoRemetente
  modo_humano: boolean
  created_at: string
}

export interface Usuario {
  id: string
  tenant_id: string | null
  email: string
  role: RoleUsuario
}

export interface JWTPayload {
  sub: string
  email: string
  role: RoleUsuario
  tenant_id: string | null
}

export interface ConfiguracaoOrrin {
  tenant_id: string
  empresa_nome: string
  email_contato: string
  telefone: string | null
  prompt_pedro: string
  timezone: string
}

// ── Marcação Digital ──

export type CategoriaInjetavel =
  | 'botox' | 'filler' | 'pdo_wire' | 'bioestimulador'
  | 'bioremodelador' | 'skinbooster' | 'outro'

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
  product_id: string
  quantity: number
  unit: string
  lot_id: string | null
  created_by: string | null
  created_at: string
}

export interface FotoPaciente {
  id: string
  tenant_id: string
  paciente_id: string
  url: string
  tipo: 'antes' | 'depois' | 'geral'
  legenda: string | null
  created_at: string
}
