// frontend/src/components/marcacao/ProductSidebar.tsx
import type { Injetavel } from '../../types'
import { CATEGORIA_LABELS } from './MarkingList'

interface ProductSidebarProps {
  injetaveis: Injetavel[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ProductSidebar({ injetaveis, selectedId, onSelect }: ProductSidebarProps) {
  const ativos = injetaveis.filter((p) => p.ativo)
  const grouped = ativos.reduce<Record<string, Injetavel[]>>((acc, p) => {
    if (!acc[p.categoria]) acc[p.categoria] = []
    acc[p.categoria].push(p)
    return acc
  }, {})

  if (ativos.length === 0) return null

  return (
    <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
      <h3 className="text-sm font-semibold text-gray-800">Produtos</h3>
      {Object.entries(grouped).map(([categoria, items]) => (
        <div key={categoria}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            {CATEGORIA_LABELS[categoria] ?? categoria}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((p) => {
              const isSelected = selectedId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(isSelected ? null : p.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.cor_hex }} />
                  {p.nome}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
