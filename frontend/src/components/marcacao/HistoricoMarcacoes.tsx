// frontend/src/components/marcacao/HistoricoMarcacoes.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Atendimento, InjectionMarking, FotoPaciente } from '../../types'
import { MarkingList } from './MarkingList'

interface HistoricoMarcacoesProps {
  pacienteId: string
}

export function HistoricoMarcacoes({ pacienteId }: HistoricoMarcacoesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: atendimentos = [] } = useQuery<Atendimento[]>({
    queryKey: ['atendimentos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/atendimentos/${pacienteId}`)).data,
  })

  const { data: todasMarcacoes = [] } = useQuery<InjectionMarking[]>({
    queryKey: ['all-markings', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/paciente/${pacienteId}`)).data,
  })

  const { data: fotos = [] } = useQuery<FotoPaciente[]>({
    queryKey: ['fotos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/fotos/${pacienteId}`)).data,
  })

  if (atendimentos.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhuma sessão registrada ainda.</p>
  }

  return (
    <div className="space-y-2">
      {atendimentos.map((sessao) => {
        const isOpen = expandedId === sessao.id
        const marcacoesDaSessao = todasMarcacoes.filter((m) => m.visit_id === sessao.id)
        const fotosDaSessao = fotos.filter((f) => f.visit_id === sessao.id)

        return (
          <div key={sessao.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedId(isOpen ? null : sessao.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-800">
                {new Date(sessao.data_atendimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-xs text-gray-400">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                <MarkingList markings={marcacoesDaSessao} />
                {fotosDaSessao.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {fotosDaSessao.map((f) => (
                      <img key={f.id} src={f.url} alt={f.tipo} className="w-20 h-20 object-cover rounded-lg border border-gray-100" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
