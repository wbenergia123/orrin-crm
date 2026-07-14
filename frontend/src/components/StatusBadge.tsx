import { cn } from '@/lib/utils'
import type { StatusPaciente } from '../types'

const labels: Record<StatusPaciente, string> = {
  novo: 'Novo',
  em_conversa: 'Em Conversa',
  consulta_agendada: 'Consulta Agendada',
  cliente: 'Cliente',
  frio: 'Frio',
  reuniao_agendada: 'Reunião Agendada',
  orcamento_enviado: 'Orçamento Enviado',
  negociacao: 'Negociação',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

const colors: Record<StatusPaciente, string> = {
  novo: 'bg-blue-100 text-blue-700',
  em_conversa: 'bg-amber-100 text-amber-700',
  consulta_agendada: 'bg-emerald-100 text-emerald-700',
  cliente: 'bg-purple-100 text-purple-700',
  frio: 'bg-gray-100 text-gray-500',
  reuniao_agendada: 'bg-blue-100 text-blue-700',
  orcamento_enviado: 'bg-amber-100 text-amber-700',
  negociacao: 'bg-indigo-100 text-indigo-700',
  fechado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-gray-100 text-gray-500',
}

interface Props {
  status: StatusPaciente
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colors[status], className)}>
      {labels[status]}
    </span>
  )
}
