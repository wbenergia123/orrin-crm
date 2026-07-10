// frontend/src/pages/Studio3D.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Simulacao3D } from '../types'
import { UploadFotos } from '../components/simulacao/UploadFotos'
import { ProgressoGeracao } from '../components/simulacao/ProgressoGeracao'
import { EditorSimulacao } from '../components/simulacao/EditorSimulacao'

interface PacienteBusca { id: string; nome: string }

export function Studio3D() {
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [paciente, setPaciente] = useState<PacienteBusca | null>(null)
  const [simulacaoAtiva, setSimulacaoAtiva] = useState<Simulacao3D | null>(null)
  const [criando, setCriando] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300)
    return () => clearTimeout(t)
  }, [busca])

  const { data: pacientes } = useQuery({
    queryKey: ['pacientes-busca-3d', buscaDebounced],
    enabled: buscaDebounced.length >= 2 && !paciente,
    queryFn: async () => (await api.get<PacienteBusca[]>(`/pacientes?busca=${encodeURIComponent(buscaDebounced)}`)).data,
  })

  const { data: simulacoes } = useQuery({
    queryKey: ['simulacoes', paciente?.id],
    enabled: !!paciente,
    queryFn: async () => (await api.get<Simulacao3D[]>(`/simulacoes?paciente_id=${paciente!.id}`)).data,
  })

  // Ao clicar num card, buscar o detalhe (a lista não traz glb_url/ancoras/sliders)
  async function abrirSimulacao(id: string) {
    const { data } = await api.get<Simulacao3D>(`/simulacoes/${id}`)
    setSimulacaoAtiva(data)
  }

  const temModeloPronto = simulacoes?.some((s) => s.status === 'succeeded') ?? false

  const { mutate: clonar, isPending: clonando } = useMutation({
    mutationFn: async () => (await api.post<Simulacao3D>('/simulacoes', { paciente_id: paciente!.id })).data,
    onSuccess: (sim) => {
      queryClient.invalidateQueries({ queryKey: ['simulacoes', paciente?.id] })
      setSimulacaoAtiva(sim)
    },
  })

  return (
    // translate="no": o Google Tradutor automático reescreve textos e congela os
    // labels do React (% parado, sliders virando "Projeção da mesa")
    <div className="p-6 max-w-5xl mx-auto" translate="no">
      <h1 className="text-xl font-semibold text-gray-800">Studio 3D</h1>
      <p className="text-sm text-gray-500 mt-1">Simulação estética facial em 3D</p>

      {!paciente && (
        <div className="mt-6 max-w-md">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente pelo nome…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="mt-2 space-y-1">
            {pacientes?.map((p) => (
              <button key={p.id} onClick={() => setPaciente(p)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {paciente && !simulacaoAtiva && !criando && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">{paciente.nome}</p>
            <div className="flex gap-2">
              {temModeloPronto ? (
                <>
                  <button onClick={() => clonar()} disabled={clonando}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">
                    {clonando ? 'Criando…' : 'Nova simulação'}
                  </button>
                  <button onClick={() => setCriando(true)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600">Novo modelo (fotos novas)</button>
                </>
              ) : (
                <button onClick={() => setCriando(true)}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm">Nova simulação</button>
              )}
              <button onClick={() => { setPaciente(null); setBusca('') }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600">Trocar paciente</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {simulacoes?.map((s) => (
              <button key={s.id} onClick={() => abrirSimulacao(s.id)}
                className="border border-gray-100 rounded-xl p-3 text-left hover:border-gray-300">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt="" className="w-full h-28 object-cover rounded-lg" />
                  : <div className="w-full h-28 bg-gray-50 rounded-lg" />}
                <p className="text-xs text-gray-500 mt-2">{new Date(s.criado_em).toLocaleDateString('pt-BR')}</p>
                <p className="text-xs font-medium text-gray-700">{s.status === 'succeeded' ? 'Pronta' : s.status === 'failed' ? 'Falhou' : 'Gerando…'}</p>
              </button>
            ))}
            {simulacoes?.length === 0 && <p className="text-sm text-gray-400 col-span-full">Nenhuma simulação ainda.</p>}
          </div>
        </div>
      )}

      {paciente && criando && (
        <div className="mt-6">
          <UploadFotos pacienteId={paciente.id} onCriada={(sim) => { setCriando(false); setSimulacaoAtiva(sim) }} />
        </div>
      )}

      {simulacaoAtiva && simulacaoAtiva.status !== 'succeeded' && (
        <ProgressoGeracao simulacaoId={simulacaoAtiva.id} onPronta={(sim) => setSimulacaoAtiva(sim)} />
      )}

      {simulacaoAtiva?.status === 'succeeded' && simulacaoAtiva.modelo_glb_url && (
        <div className="mt-6">
          <EditorSimulacao simulacao={simulacaoAtiva} onVoltar={() => setSimulacaoAtiva(null)} />
        </div>
      )}
    </div>
  )
}
