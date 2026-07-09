// frontend/src/components/simulacao/EditorSimulacao.tsx
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Simulacao3D } from '../../types'
import type { Vec3 } from '../../lib/simulacao/deformacao'
import { REGIOES } from '../../lib/simulacao/regioes'
import { Viewer3D, type Viewer3DHandle } from './Viewer3D'
import { WizardAncoras } from './WizardAncoras'
import { PainelSliders } from './PainelSliders'

interface Props {
  simulacao: Simulacao3D
  onVoltar: () => void
}

export function EditorSimulacao({ simulacao, onVoltar }: Props) {
  const viewer = useRef<Viewer3DHandle>(null)
  const [ancoras, setAncoras] = useState<Record<string, Vec3>>(simulacao.ancoras ?? {})
  const [valores, setValores] = useState<Record<string, number>>(simulacao.sliders ?? {})
  const [modoClique, setModoClique] = useState(false)
  const [ultimoClique, setUltimoClique] = useState<Vec3 | null>(null)
  const [mostrandoAntes, setMostrandoAntes] = useState(false)

  const precisaWizard = Object.keys(ancoras).length === 0

  const { mutate: salvarEstado, isPending: salvando } = useMutation({
    mutationFn: () => api.patch(`/simulacoes/${simulacao.id}`, { sliders: valores }),
  })

  const { mutate: salvarScreenshot, isPending: fotografando } = useMutation({
    mutationFn: async () => {
      const blob = await viewer.current?.capturarPng()
      if (!blob) throw new Error('captura falhou')
      const form = new FormData()
      form.append('imagem', blob, 'screenshot.png')
      return api.post(`/simulacoes/${simulacao.id}/screenshot`, form)
    },
  })

  function aoMudarSlider(id: string, valor: number) {
    const novos = { ...valores, [id]: valor }
    setValores(novos)
    setMostrandoAntes(false)
    viewer.current?.aplicarSliders(ancoras, novos, REGIOES)
  }

  return (
    <div>
      <button onClick={onVoltar} className="text-sm text-gray-500 underline">← Voltar</button>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 mt-3">
        <div>
          <Viewer3D
            ref={viewer}
            glbUrl={simulacao.modelo_glb_url!}
            onCliqueMalha={modoClique ? (p) => setUltimoClique(p) : undefined}
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onMouseDown={() => { setMostrandoAntes(true); viewer.current?.mostrarAntes(true) }}
              onMouseUp={() => { setMostrandoAntes(false); viewer.current?.mostrarAntes(false) }}
              onMouseLeave={() => { if (mostrandoAntes) { setMostrandoAntes(false); viewer.current?.mostrarAntes(false) } }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600"
            >
              Segurar para ver o ANTES
            </button>
            <button onClick={() => salvarEstado()} disabled={salvando}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">
              {salvando ? 'Salvando…' : 'Salvar simulação'}
            </button>
            <button onClick={() => salvarScreenshot()} disabled={fotografando}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40">
              {fotografando ? 'Capturando…' : 'Capturar imagem'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Simulação ilustrativa — não representa promessa de resultado.
          </p>
        </div>
        <div>
          {precisaWizard ? (
            <WizardAncoras
              simulacaoId={simulacao.id}
              ancorasIniciais={{}}
              onPontoPendente={setModoClique}
              ultimoClique={ultimoClique}
              onConcluido={(a) => { setAncoras(a); setModoClique(false); viewer.current?.limparIndices() }}
            />
          ) : (
            <>
              <PainelSliders
                valores={valores}
                onChange={aoMudarSlider}
                onReset={() => { setValores({}); viewer.current?.aplicarSliders(ancoras, {}, REGIOES) }}
              />
              <button
                onClick={() => { setAncoras({}); setValores({}); setUltimoClique(null) }}
                className="mt-4 text-xs text-gray-400 underline"
              >
                Reposicionar âncoras
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
