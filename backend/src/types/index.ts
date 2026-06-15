// backend/src/types/index.ts

export type StatusCliente = 'novo' | 'contato_feito' | 'reuniao_agendada' | 'cliente' | 'perdido'
export type StatusReuniао = 'agendada' | 'confirmada' | 'cancelada' | 'realizada'
export type RoleUsuario = 'admin' | 'vendedor'
export type TipoRemetente = 'agente' | 'humano'

export interface Cliente {
  id: string
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
  cliente_id: string
  mensagem_cliente: string | null
  mensagem_agente: string | null
  tipo_remetente: TipoRemetente
  modo_humano: boolean
  created_at: string
}

export interface Usuario {
  id: string
  email: string
  role: RoleUsuario
}

export interface JWTPayload {
  sub: string
  email: string
  role: RoleUsuario
}

export interface ConfiguracaoOrrin {
  empresa_nome: string
  email_contato: string
  telefone: string | null
  prompt_pedro: string
  timezone: string
}
