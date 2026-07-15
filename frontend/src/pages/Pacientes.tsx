import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { api } from '../api/client'
import type { Paciente, StatusPaciente } from '../types'
import { PatientCard } from '../components/PatientCard'
import { ConversaPanel } from '../components/ConversaPanel'
import { NovoPacienteModal } from '../components/NovoPacienteModal'
import { useAuth } from '../hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const COLUMNS_CLINICA: { id: StatusPaciente; label: string; color: string }[] = [
  { id: 'novo',              label: 'Novo',        color: '#8b5cf6' },
  { id: 'em_conversa',       label: 'Em Conversa', color: '#f59e0b' },
  { id: 'consulta_agendada', label: 'Agendado',    color: '#3b82f6' },
  { id: 'cliente',           label: 'Cliente',     color: '#10b981' },
  { id: 'frio',              label: 'Frio',        color: '#9ca3af' },
]
const COLUMNS_AGRO: { id: StatusPaciente; label: string; color: string }[] = [
  { id: 'novo',              label: 'Novo',            color: '#8b5cf6' },
  { id: 'em_conversa',       label: 'Em Conversa',     color: '#f59e0b' },
  { id: 'reuniao_agendada',  label: 'Reunião Marcada', color: '#3b82f6' },
  { id: 'orcamento_enviado', label: 'Orçamento',       color: '#06b6d4' },
  { id: 'negociacao',        label: 'Negociação',      color: '#f97316' },
  { id: 'fechado',           label: 'Fechado',         color: '#10b981' },
  { id: 'perdido',           label: 'Perdido',         color: '#9ca3af' },
]

export function Pacientes() {
  const qc = useQueryClient()
  const { usuario } = useAuth()
  const vertical = usuario?.vertical ?? 'clinica'
  const COLUMNS = vertical === 'agro' ? COLUMNS_AGRO : COLUMNS_CLINICA
  const [selecionado, setSelecionado] = useState<Paciente | null>(null)
  const [modalNovoPaciente, setModalNovoPaciente] = useState(false)
  const [fechando, setFechando] = useState<{ id: string; nome: string | null } | null>(null)
  const [valorFechado, setValorFechado] = useState('')

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes-kanban'],
    queryFn: async () => (await api.get('/pacientes')).data,
    refetchInterval: 30_000,
  })

  const { mutate: atualizarStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StatusPaciente }) =>
      api.patch(`/pacientes/${id}/status`, { status }),
    onError: (_err, vars) => {
      // Reverte atualização otimista em caso de erro
      qc.invalidateQueries({ queryKey: ['pacientes-kanban'] })
      setSelecionado(null)
      console.error('[KANBAN] Falha ao atualizar status de', vars.id)
    },
  })

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return
    const novoStatus = result.destination.droppableId as StatusPaciente
    const pacienteId = result.draggableId

    const paciente = pacientes.find((p) => p.id === pacienteId)
    if (!paciente || paciente.status === novoStatus) return

    if (novoStatus === 'fechado') {
      setFechando({ id: pacienteId, nome: paciente.nome ?? null })
      return
    }

    // Atualização otimista
    qc.setQueryData<Paciente[]>(['pacientes-kanban'], (prev = []) =>
      prev.map((p) => p.id === pacienteId ? { ...p, status: novoStatus } : p)
    )
    if (selecionado?.id === pacienteId) {
      setSelecionado((prev) => prev ? { ...prev, status: novoStatus } : null)
    }

    atualizarStatus({ id: pacienteId, status: novoStatus })
  }, [pacientes, qc, atualizarStatus, selecionado])

  const handleStatusChange = useCallback((status: StatusPaciente) => {
    if (!selecionado) return
    qc.setQueryData<Paciente[]>(['pacientes-kanban'], (prev = []) =>
      prev.map((p) => p.id === selecionado.id ? { ...p, status } : p)
    )
    setSelecionado((prev) => prev ? { ...prev, status } : null)
    atualizarStatus({ id: selecionado.id, status })
  }, [selecionado, qc, atualizarStatus])

  const porStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = pacientes.filter((p) => p.status === col.id)
    return acc
  }, {} as Record<StatusPaciente, Paciente[]>)

  return (
    <div className="flex h-full overflow-hidden -mx-6 -my-6">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Pipeline</h1>
            <p className="text-xs text-gray-400 mt-0.5">{pacientes.length} leads</p>
          </div>
          <button
            onClick={() => setModalNovoPaciente(true)}
            className="flex items-center gap-1.5 bg-violet-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Plus size={15} /> {vertical === 'agro' ? 'Novo cliente' : 'Novo paciente'}
          </button>
        </div>

        {/* Kanban */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto">
            <div className="flex gap-4 p-6 h-full min-w-max touch-pan-x">
              {COLUMNS.map((col) => (
                <div key={col.id} className="flex flex-col w-[220px]">
                  {/* Cabeçalho da coluna */}
                  <div className="flex items-center gap-2 px-1 mb-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                    <span className="text-sm font-semibold text-gray-600">{col.label}</span>
                    <span className="ml-auto bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 text-xs">
                      {porStatus[col.id].length}
                    </span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={[
                          'flex flex-col gap-2 flex-1 rounded-xl p-1 min-h-[60px] transition-colors',
                          snapshot.isDraggingOver ? 'bg-gray-100' : '',
                        ].join(' ')}
                      >
                        {porStatus[col.id].map((paciente, index) => (
                          <Draggable
                            key={paciente.id}
                            draggableId={paciente.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  opacity: snapshot.isDragging ? 0.75 : 1,
                                }}
                              >
                                <PatientCard
                                  paciente={paciente}
                                  isSelected={selecionado?.id === paciente.id}
                                  onClick={() =>
                                    setSelecionado(
                                      selecionado?.id === paciente.id ? null : paciente
                                    )
                                  }
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </div>
        </DragDropContext>
      </div>

      {/* Painel lateral de conversa */}
      {selecionado && (
        <ConversaPanel
          paciente={selecionado}
          onClose={() => setSelecionado(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <NovoPacienteModal
        open={modalNovoPaciente}
        onClose={() => setModalNovoPaciente(false)}
        onSuccess={(p) => setSelecionado(p)}
      />

      {fechando && (
        <Dialog open onOpenChange={() => { setFechando(null); setValorFechado('') }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Fechar negócio — {fechando.nome ?? 'cliente'}</DialogTitle></DialogHeader>
            <Label htmlFor="valor-fechado">Valor fechado (R$)</Label>
            <Input id="valor-fechado" type="number" min="0" step="0.01" value={valorFechado} onChange={(e) => setValorFechado(e.target.value)} autoFocus />
            <Button
              disabled={!valorFechado || Number(valorFechado) <= 0}
              onClick={async () => {
                await api.patch(`/pacientes/${fechando.id}`, {
                  valor_fechado: Number(valorFechado),
                  data_fechamento: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
                })
                atualizarStatus({ id: fechando.id, status: 'fechado' })
                qc.setQueryData<Paciente[]>(['pacientes-kanban'], (prev = []) =>
                  prev.map((p) => p.id === fechando.id ? { ...p, status: 'fechado' } : p))
                setFechando(null); setValorFechado('')
              }}
            >Confirmar fechamento</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
