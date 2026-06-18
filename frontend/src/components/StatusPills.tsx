import type { StatusPaciente } from '../types'

const STATUS_ORDER: StatusPaciente[] = [
  'novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio',
]

const STATUS_LABELS: Record<StatusPaciente, string> = {
  novo: 'Novo',
  em_conversa: 'Em Conversa',
  consulta_agendada: 'Agendado',
  cliente: 'Cliente',
  frio: 'Frio',
}

const STATUS_ACTIVE_CLASS: Record<StatusPaciente, string> = {
  novo: 'bg-violet-600 text-white',
  em_conversa: 'bg-amber-500 text-white',
  consulta_agendada: 'bg-blue-600 text-white',
  cliente: 'bg-emerald-600 text-white',
  frio: 'bg-gray-500 text-white',
}

interface StatusPillsProps {
  status: StatusPaciente
  onStatusChange?: (status: StatusPaciente) => void
}

export function StatusPills({ status, onStatusChange }: StatusPillsProps) {
  const currentIndex = STATUS_ORDER.indexOf(status)

  return (
    <div className="flex gap-1.5 flex-wrap">
      {STATUS_ORDER.map((s, i) => {
        const isDone = i < currentIndex
        const isActive = i === currentIndex

        return (
          <button
            key={s}
            onClick={() => onStatusChange?.(s)}
            disabled={!onStatusChange}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1',
              isDone && 'bg-emerald-100 text-emerald-700',
              isActive && STATUS_ACTIVE_CLASS[s],
              !isDone && !isActive && 'bg-gray-100 text-gray-400',
              onStatusChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
            ].filter(Boolean).join(' ')}
          >
            {isDone && '✓ '}{STATUS_LABELS[s]}
          </button>
        )
      })}
    </div>
  )
}
