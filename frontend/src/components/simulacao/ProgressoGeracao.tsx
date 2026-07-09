// frontend/src/components/simulacao/ProgressoGeracao.tsx
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Simulacao3D } from '../../types'

interface Props {
  simulacaoId: string
  onPronta: (sim: Simulacao3D) => void
}

export function ProgressoGeracao({ simulacaoId, onPronta }: Props) {
  const { data: sim } = useQuery({
    queryKey: ['simulacao', simulacaoId],
    queryFn: async () => (await api.get<Simulacao3D>(`/simulacoes/${simulacaoId}`)).data,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'pending' || s === 'processing' ? 4000 : false
    },
  })

  useEffect(() => {
    if (sim?.status === 'succeeded') onPronta(sim)
  }, [sim, onPronta])

  if (sim?.status === 'succeeded') return null

  if (sim?.status === 'failed') {
    return (
      <div className="text-center p-8">
        <p className="text-sm text-red-500">A geração do modelo 3D falhou.</p>
        <p className="text-xs text-gray-400 mt-1">Os créditos foram estornados. Tente novamente com fotos mais nítidas.</p>
      </div>
    )
  }

  const pct = sim?.progress ?? 0
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-gray-600 font-medium">Gerando modelo 3D…</p>
      <div className="w-64 h-2 bg-gray-100 rounded-full mx-auto mt-4 overflow-hidden">
        <div className="h-full bg-gray-800 rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 5)}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-2">Isso leva ~1–2 minutos. Pode continuar navegando em outra aba.</p>
    </div>
  )
}
