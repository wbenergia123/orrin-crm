// frontend/src/components/marcacao/MarkingEditor.tsx
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Injetavel } from '../../types'

interface MarkingEditorProps {
  x: number
  y: number
  injetaveis: Injetavel[]
  onSave: (data: { product_id: string; quantity: number; unit: string; lot_id?: string }) => void
  onCancel: () => void
  initial?: { product_id?: string; quantity?: number; unit?: string; lot_id?: string }
}

export function MarkingEditor({ x, y, injetaveis, onSave, onCancel, initial }: MarkingEditorProps) {
  const [product_id, setProductId] = useState(initial?.product_id ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '')
  const [lot_id, setLotId] = useState(initial?.lot_id ?? '')
  const ref = useRef<HTMLDivElement>(null)

  const selectedProduct = injetaveis.find((p) => p.id === product_id)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!product_id || !quantity) return
    onSave({
      product_id,
      quantity: parseFloat(quantity),
      unit: selectedProduct?.unidade ?? 'UI',
      lot_id: lot_id || undefined,
    })
  }

  return (
    <div
      ref={ref}
      className="absolute z-30 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -110%)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-600">Nova marcação</span>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Produto *</label>
          <select
            value={product_id}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            required
          >
            <option value="">Selecionar...</option>
            {injetaveis.filter((p) => p.ativo).map((p) => (
              <option key={p.id} value={p.id}>{p.nome} ({p.categoria})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Quantidade {selectedProduct && `(${selectedProduct.unidade})`} *
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lote (opcional)</label>
          <input
            type="text"
            value={lot_id}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Ex: LOT-2026-001"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 text-xs text-white bg-amber-500 rounded-lg py-1.5 hover:bg-amber-600"
          >
            Marcar
          </button>
        </div>
      </form>
    </div>
  )
}
