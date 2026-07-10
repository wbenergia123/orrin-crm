// frontend/src/components/simulacao/PainelSliders.tsx
import { GRUPOS, REGIOES } from '../../lib/simulacao/regioes'
import type { Vec3 } from '../../lib/simulacao/deformacao'

interface Props {
  valores: Record<string, number>
  ancoras: Record<string, Vec3>
  onChange: (id: string, valor: number) => void
  onReset: () => void
}

export function PainelSliders({ valores, ancoras, onChange, onReset }: Props) {
  // só mostra sliders cujas âncoras existem neste modelo — modelos com âncoras
  // antigas (wizard de 7 pontos) não exibem controles mortos; "Reposicionar
  // âncoras" refaz com o conjunto completo e libera tudo
  const disponiveis = REGIOES.filter(
    (r) => ancoras[r.ancora] && (!r.ancoraEspelho || ancoras[r.ancoraEspelho])
  )
  const faltando = REGIOES.length - disponiveis.length

  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => {
        const doGrupo = disponiveis.filter((r) => r.grupo === g.id)
        if (doGrupo.length === 0) return null
        return (
          <div key={g.id}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.label}</p>
            <div className="space-y-2 mt-2">
              {doGrupo.map((r) => (
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
        )
      })}
      {faltando > 0 && (
        <p className="text-[11px] text-gray-400">
          +{faltando} controles disponíveis ao reposicionar as âncoras (novos pontos foram adicionados).
        </p>
      )}
      <button onClick={onReset} className="text-xs text-gray-500 underline">Zerar tudo</button>
    </div>
  )
}
