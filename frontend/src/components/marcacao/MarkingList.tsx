// frontend/src/components/marcacao/MarkingList.tsx
import { Trash2, Pencil } from 'lucide-react'
import type { InjectionMarking } from '../../types'

interface MarkingListProps {
  markings: InjectionMarking[]
  onEdit?: (marking: InjectionMarking) => void
  onRemove?: (markingId: string) => void
}

const CATEGORIA_LABELS: Record<string, string> = {
  botox: 'Botox',
  filler: 'Filler',
  pdo_wire: 'PDO Wire',
  bioestimulador: 'Bioestimulador',
  bioremodelador: 'Bioremodelador',
  skinbooster: 'Skinbooster',
  outro: 'Outro',
}

const VIEW_LABELS: Record<string, string> = {
  face_front: 'Face frontal',
  face_left: 'Face perfil esq.',
  face_right: 'Face perfil dir.',
  body_front: 'Corpo frontal',
  body_back: 'Corpo posterior',
}

export function MarkingList({ markings, onEdit, onRemove }: MarkingListProps) {
  if (markings.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        Nenhuma marcação nesta sessão.
        <br />
        Clique no mapa para adicionar.
      </div>
    )
  }

  // Agrupar por view_type
  const grouped = markings.reduce<Record<string, InjectionMarking[]>>((acc, m) => {
    const key = m.view_type
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([view, items]) => (
        <div key={view}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {VIEW_LABELS[view] ?? view} ({items.length})
          </h4>
          <div className="space-y-1.5">
            {items.map((m) => {
              const nome = m.injetaveis?.nome ?? 'Produto'
              const cor = m.injetaveis?.cor_hex ?? '#f59e0b'
              const unidade = m.injetaveis?.unidade ?? m.unit
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 group hover:shadow-sm transition-shadow"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white"
                    style={{ backgroundColor: cor }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate block">
                      {nome}
                    </span>
                    <span className="text-xs text-gray-400">
                      {m.quantity} {unidade}
                      {m.lot_id && ` · Lote: ${m.lot_id}`}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(m)}
                        className="p-1 text-gray-400 hover:text-amber-600"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onClick={() => onRemove(m.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export { CATEGORIA_LABELS, VIEW_LABELS }
