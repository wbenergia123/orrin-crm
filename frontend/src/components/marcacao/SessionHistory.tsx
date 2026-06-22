// frontend/src/components/marcacao/SessionHistory.tsx
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, Eye, EyeOff } from 'lucide-react'
import type { Atendimento } from '../../types'

interface SessionHistoryProps {
  sessions: Atendimento[]
  currentVisitId: string
  compareVisitId: string | null
  onSelectCompare: (visitId: string | null) => void
}

export function SessionHistory({
  sessions,
  currentVisitId,
  compareVisitId,
  onSelectCompare,
}: SessionHistoryProps) {
  const pastSessions = sessions.filter((s) => s.id !== currentVisitId)

  if (pastSessions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <Calendar size={14} />
        Nenhuma sessão anterior para comparar.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
        <Calendar size={14} /> Comparar com:
      </span>
      <button
        onClick={() => onSelectCompare(null)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          !compareVisitId
            ? 'bg-amber-50 text-amber-600 border-amber-200'
            : 'text-gray-500 border-gray-200 hover:bg-gray-50'
        }`}
      >
        <EyeOff size={12} className="inline mr-1" />
        Não comparar
      </button>
      {pastSessions.slice(0, 6).map((s) => {
        const isCompare = compareVisitId === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSelectCompare(isCompare ? null : s.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              isCompare
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Eye size={12} className="inline mr-1" />
            {format(new Date(s.data_atendimento), "d MMM yyyy", { locale: ptBR })}
          </button>
        )
      })}
    </div>
  )
}
