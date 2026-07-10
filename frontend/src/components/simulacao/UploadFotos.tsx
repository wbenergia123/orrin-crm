// frontend/src/components/simulacao/UploadFotos.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Simulacao3D } from '../../types'

interface Props {
  pacienteId: string
  onCriada: (sim: Simulacao3D) => void
}

export function UploadFotos({ pacienteId, onCriada }: Props) {
  const [fotos, setFotos] = useState<File[]>([])
  const queryClient = useQueryClient()

  const { mutate: criar, isPending, error } = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('paciente_id', pacienteId)
      form.append('forcar_geracao', 'true')
      fotos.forEach((f) => form.append('fotos', f))
      return (await api.post<Simulacao3D>('/simulacoes', form)).data
    },
    onSuccess: (sim) => {
      queryClient.invalidateQueries({ queryKey: ['simulacoes', pacienteId] })
      onCriada(sim)
    },
  })

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
      <p className="text-sm text-gray-600 font-medium">Fotos do paciente (2 a 4)</p>
      <p className="text-xs text-gray-400 mt-1">Melhor resultado: 4 fotos — frontal + perfil esquerdo + perfil direito + de baixo (submento)</p>
      <p className="text-[11px] text-gray-400 mt-0.5">Cabelo preso, luz uniforme de frente, expressão neutra, sem óculos</p>
      <input
        type="file" accept="image/jpeg,image/png" multiple
        className="mt-4 text-sm"
        onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, 4))}
      />
      {fotos.length > 0 && (
        <div className="flex gap-2 justify-center mt-3">
          {fotos.map((f, i) => (
            <img key={i} src={URL.createObjectURL(f)} alt={f.name} className="w-16 h-16 object-cover rounded-lg" />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{(error as any)?.response?.data?.error ?? 'Erro ao criar simulação'}</p>}
      <button
        disabled={fotos.length < 2 || isPending}
        onClick={() => criar()}
        className="mt-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40"
      >
        {isPending ? 'Enviando…' : 'Gerar modelo 3D'}
      </button>
    </div>
  )
}
