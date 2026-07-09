// frontend/src/components/simulacao/PainelSliders.tsx
import { GRUPOS, REGIOES } from '../../lib/simulacao/regioes'

interface Props {
  valores: Record<string, number>
  onChange: (id: string, valor: number) => void
  onReset: () => void
}

export function PainelSliders({ valores, onChange, onReset }: Props) {
  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => (
        <div key={g.id}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.label}</p>
          <div className="space-y-2 mt-2">
            {REGIOES.filter((r) => r.grupo === g.id).map((r) => (
              <label key={r.id} className="block">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-gray-400">{Math.round((valores[r.id] ?? 0) * 100)}%</span>
                </div>
                <input
                  type="range" min={-1} max={1} step={0.05}
                  value={valores[r.id] ?? 0}
                  onChange={(e) => onChange(r.id, Number(e.target.value))}
                  className="w-full accent-gray-800"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button onClick={onReset} className="text-xs text-gray-500 underline">Zerar tudo</button>
    </div>
  )
}
