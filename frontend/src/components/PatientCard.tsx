import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parseUtcTimestamp } from '../lib/utils'
import type { Paciente, StatusPaciente } from '../types'

const AVATAR_CLASS: Record<StatusPaciente, string> = {
  novo: 'bg-violet-100 text-violet-700',
  em_conversa: 'bg-amber-100 text-amber-700',
  consulta_agendada: 'bg-blue-100 text-blue-700',
  cliente: 'bg-emerald-100 text-emerald-700',
  frio: 'bg-gray-100 text-gray-500',
  reuniao_agendada: 'bg-blue-100 text-blue-700',
  orcamento_enviado: 'bg-amber-100 text-amber-700',
  negociacao: 'bg-indigo-100 text-indigo-700',
  fechado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-gray-100 text-gray-500',
}

interface PatientCardProps {
  paciente: Paciente
  isSelected: boolean
  onClick: () => void
}

export function PatientCard({ paciente, isSelected, onClick }: PatientCardProps) {
  const initial = (paciente.nome ?? paciente.telefone).charAt(0).toUpperCase()
  const timeAgo = paciente.ultimo_contato_at
    ? formatDistanceToNow(parseUtcTimestamp(paciente.ultimo_contato_at), { locale: ptBR })
    : null

  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-xl border p-3.5 cursor-pointer transition-all select-none',
        isSelected
          ? 'border-violet-400 shadow-md shadow-violet-100'
          : 'border-gray-100 hover:border-gray-200 hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${AVATAR_CLASS[paciente.status]}`}>
          {initial}
        </div>
        <span className="font-semibold text-gray-800 text-sm flex-1 truncate">
          {paciente.nome ?? '—'}
        </span>
        {timeAgo && (
          <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo}</span>
        )}
      </div>
      <p className="text-xs text-gray-500">{paciente.telefone}</p>
    </div>
  )
}
