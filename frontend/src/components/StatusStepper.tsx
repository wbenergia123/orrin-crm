import { cn } from '@/lib/utils'
import type { StatusPaciente } from '../types'

const steps: { value: StatusPaciente; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_conversa', label: 'Em Conversa' },
  { value: 'consulta_agendada', label: 'Consulta Agendada' },
  { value: 'cliente', label: 'Cliente' },
]

const stepOrder: Record<StatusPaciente, number> = {
  novo: 0,
  em_conversa: 1,
  consulta_agendada: 2,
  cliente: 3,
  frio: -1,
}

interface Props {
  status: StatusPaciente
  onChange?: (status: StatusPaciente) => void
}

export function StatusStepper({ status, onChange }: Props) {
  const currentIndex = stepOrder[status]

  if (status === 'frio') {
    return (
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">Frio</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIndex
        const isActive = idx === currentIndex
        return (
          <button
            key={step.value}
            onClick={() => onChange?.(step.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors',
              isActive && 'bg-emerald-500 text-white',
              isCompleted && 'bg-emerald-100 text-emerald-700',
              !isActive && !isCompleted && 'bg-gray-100 text-gray-400 hover:bg-gray-200',
              onChange ? 'cursor-pointer' : 'cursor-default'
            )}
          >
            {isCompleted && <span>✓</span>}
            {step.label}
          </button>
        )
      })}
    </div>
  )
}
