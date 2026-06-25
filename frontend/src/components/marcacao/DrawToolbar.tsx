// frontend/src/components/marcacao/DrawToolbar.tsx
import { Circle, Minus, Square } from 'lucide-react'
import type { DrawTool } from './BodyMapSVG'

interface DrawToolbarProps {
  tool: DrawTool
  onChange: (tool: DrawTool) => void
  suggestedTool?: DrawTool
}

const TOOLS: { key: DrawTool; label: string; icon: typeof Circle }[] = [
  { key: 'ponto', label: 'Ponto', icon: Circle },
  { key: 'linha', label: 'Linha', icon: Minus },
  { key: 'forma', label: 'Forma', icon: Square },
]

export function DrawToolbar({ tool, onChange, suggestedTool }: DrawToolbarProps) {
  // Mostra sugestão discreta sem forçar
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
      {TOOLS.map(({ key, label, icon: Icon }) => {
        const isSuggested = suggestedTool === key && tool !== key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tool === key
                ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Icon size={14} />
            {label}
            {isSuggested && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
        )
      })}
    </div>
  )
}
