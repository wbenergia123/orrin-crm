// frontend/src/components/simulacao/WizardAncoras.tsx
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Vec3 } from '../../lib/simulacao/deformacao'
import { ANCORAS_WIZARD } from '../../lib/simulacao/regioes'

interface Props {
  simulacaoId: string
  ancorasIniciais: Record<string, Vec3>
  onPontoPendente: (esperandoClique: boolean) => void
  ultimoClique: Vec3 | null
  onConcluido: (ancoras: Record<string, Vec3>) => void
}

export function WizardAncoras({ simulacaoId, ancorasIniciais, onPontoPendente, ultimoClique, onConcluido }: Props) {
  const [ancoras, setAncoras] = useState(ancorasIniciais)
  const [passo, setPasso] = useState(0)
  const concluido = passo >= ANCORAS_WIZARD.length
  // inicializa com o valor atual da prop (não null) para ignorar um clique
  // já "gasto" de antes do wizard remontar (ex: fluxo de reposicionar âncoras)
  const cliqueProcessado = useRef<Vec3 | null>(ultimoClique)

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: async (ancorasFinais: Record<string, Vec3>) => {
      await api.patch(`/simulacoes/${simulacaoId}`, { ancoras: ancorasFinais })
      return ancorasFinais
    },
    onSuccess: (ancorasFinais) => onConcluido(ancorasFinais),
  })

  // sinaliza ao pai se o viewer deve capturar o próximo clique
  useEffect(() => {
    onPontoPendente(!concluido && !isPending)
    return () => onPontoPendente(false)
  }, [concluido, isPending, onPontoPendente])

  // registra a posição clicada como a âncora do passo atual e avança
  useEffect(() => {
    if (!ultimoClique || concluido) return
    if (cliqueProcessado.current === ultimoClique) return
    cliqueProcessado.current = ultimoClique

    const chave = ANCORAS_WIZARD[passo].chave
    const novasAncoras = { ...ancoras, [chave]: ultimoClique }
    setAncoras(novasAncoras)

    if (passo + 1 >= ANCORAS_WIZARD.length) {
      salvar(novasAncoras)
    }
    setPasso(passo + 1)
  }, [ultimoClique, concluido, passo, ancoras, salvar])

  if (concluido) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <p className="text-sm text-gray-600 font-medium">{isPending ? 'Salvando…' : 'Âncoras posicionadas.'}</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <p className="text-xs text-gray-400">
        Posicionar âncoras — passo {passo + 1} de {ANCORAS_WIZARD.length}
      </p>
      <p className="text-base font-medium text-gray-900 mt-1">{ANCORAS_WIZARD[passo].instrucao}</p>
      <p className="text-xs text-gray-400 mt-2">Gire o modelo se precisar e clique diretamente no rosto.</p>
      {passo > 0 && (
        <button
          onClick={() => setPasso(passo - 1)}
          className="mt-4 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600"
        >
          Voltar um passo
        </button>
      )}
    </div>
  )
}
