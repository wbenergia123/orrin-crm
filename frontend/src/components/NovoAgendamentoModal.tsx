import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '../api/client'
import type { Paciente, Servico, Profissional } from '../types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { NovoPacienteModal } from './NovoPacienteModal'

interface NovoAgendamentoModalProps {
  open: boolean
  onClose: () => void
  pacienteInicial?: Paciente | null
  dataHoraInicial?: Date | null
}

export function NovoAgendamentoModal({
  open,
  onClose,
  pacienteInicial,
  dataHoraInicial,
}: NovoAgendamentoModalProps) {
  const qc = useQueryClient()

  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [buscaPaciente, setBuscaPaciente] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNovoPaciente, setShowNovoPaciente] = useState(false)
  const [servicoId, setServicoId] = useState('')
  const [profissionalId, setProfissionalId] = useState('')
  const [data, setData] = useState('')
  const [slotSelecionado, setSlotSelecionado] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [erro, setErro] = useState('')
  const [minData, setMinData] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Debounce patient search
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaPaciente), 300)
    return () => clearTimeout(t)
  }, [buscaPaciente])

  // Inicializa campos quando modal abre
  useEffect(() => {
    if (open) {
      setPaciente(pacienteInicial ?? null)
      setBuscaPaciente(pacienteInicial?.nome ?? pacienteInicial?.telefone ?? '')
      setBuscaDebounced(pacienteInicial?.nome ?? pacienteInicial?.telefone ?? '')
      setData(dataHoraInicial ? format(dataHoraInicial, 'yyyy-MM-dd') : '')
      setSlotSelecionado(null)
      setServicoId('')
      setProfissionalId('')
      setNotas('')
      setErro('')
      setMinData(format(new Date(), 'yyyy-MM-dd'))
    }
  }, [open, pacienteInicial, dataHoraInicial])

  const { data: resultadosBusca = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes-busca', buscaDebounced],
    queryFn: async () => {
      if (buscaDebounced.trim().length < 2 || paciente) return []
      return (await api.get(`/pacientes?busca=${encodeURIComponent(buscaDebounced)}`)).data
    },
    enabled: buscaDebounced.trim().length >= 2 && !paciente,
  })

  const { data: servicos = [] } = useQuery<Servico[]>({
    queryKey: ['servicos'],
    queryFn: async () => (await api.get('/servicos')).data,
    enabled: open,
  })

  const { data: profissionais = [] } = useQuery<Profissional[]>({
    queryKey: ['profissionais-ativos'],
    queryFn: async () => (await api.get('/profissionais?ativo=true')).data,
    enabled: open,
  })

  interface Slot { iso: string; hora: string; disponivel: boolean }
  const { data: slots = [] } = useQuery<Slot[]>({
    queryKey: ['slots', profissionalId, data],
    queryFn: async () =>
      (await api.get(`/agendamentos/slots-disponiveis?data=${data}&profissional_id=${profissionalId}`)).data,
    enabled: !!profissionalId && !!data,
  })

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () =>
      api.post('/agendamentos', {
        paciente_id: paciente!.id,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: slotSelecionado,
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos-agenda'] })
      qc.invalidateQueries({ queryKey: ['agendamentos-paciente', paciente?.id] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      onClose()
    },
    onError: () => setErro('Erro ao criar agendamento. Tente novamente.'),
  })

  const podeSubmeter = !!paciente && !!servicoId && !!profissionalId && !!slotSelecionado

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              📅 Novo Agendamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">

            {/* Paciente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Paciente *
              </label>
              {paciente ? (
                <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white">
                  <span className="text-sm font-medium text-violet-700">{paciente.nome ?? paciente.telefone}</span>
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                    onClick={() => { setPaciente(null); setBuscaPaciente(''); setBuscaDebounced('') }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white placeholder:text-gray-300"
                    placeholder="🔍 Buscar por nome ou telefone..."
                    value={buscaPaciente}
                    onChange={(e) => { setBuscaPaciente(e.target.value); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  />
                  {showDropdown && resultadosBusca.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      {resultadosBusca.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex justify-between"
                          onMouseDown={() => { setPaciente(p); setBuscaPaciente(p.nome ?? p.telefone); setShowDropdown(false) }}
                        >
                          <span className="font-medium">{p.nome ?? '—'}</span>
                          <span className="text-gray-400 text-xs">{p.telefone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="mt-1 text-xs text-violet-600 font-medium hover:text-violet-700"
                    onMouseDown={() => { setShowDropdown(false); setShowNovoPaciente(true) }}
                  >
                    + Cadastrar novo paciente
                  </button>
                </div>
              )}
            </div>

            {/* Serviço + Profissional */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Serviço *
                </label>
                <select
                  value={servicoId}
                  onChange={(e) => setServicoId(e.target.value)}
                  className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${servicoId ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
                >
                  <option value="">Selecione...</option>
                  {servicos.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome} — R$ {s.preco}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Profissional *
                </label>
                <select
                  value={profissionalId}
                  onChange={(e) => { setProfissionalId(e.target.value); setSlotSelecionado(null) }}
                  className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${profissionalId ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
                >
                  <option value="">Selecione...</option>
                  {profissionais.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Data */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Data *
              </label>
              <input
                type="date"
                value={data}
                min={minData}
                onChange={(e) => { setData(e.target.value); setSlotSelecionado(null) }}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${data ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
              />
            </div>

            {/* Slots */}
            {profissionalId && data && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Horário disponível *
                </label>
                {slots.length === 0 ? (
                  <p className="text-sm text-gray-400 py-1">Nenhum horário neste dia</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.iso}
                        disabled={!slot.disponivel}
                        onClick={() => slot.disponivel && setSlotSelecionado(slot.iso)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          slotSelecionado === slot.iso
                            ? 'bg-violet-600 text-white'
                            : slot.disponivel
                            ? 'bg-[#ede9fe] text-[#7c3aed] hover:bg-violet-200'
                            : 'bg-gray-100 text-gray-400 line-through cursor-default'
                        }`}
                      >
                        {slot.hora}
                      </button>
                    ))}
                  </div>
                )}
                {slots.length > 0 && (
                  <p className="text-[10px] text-gray-300">Riscado = ocupado</p>
                )}
              </div>
            )}

            {/* Notas */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Observações (opcional)
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ex: paciente alérgica a látex..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white placeholder:text-gray-300"
              />
            </div>

            {erro && <p className="text-xs text-red-500">{erro}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={onClose}
                className="border border-gray-200 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => criar()}
                disabled={!podeSubmeter || isPending}
                className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Agendando...' : 'Confirmar agendamento'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NovoPacienteModal
        open={showNovoPaciente}
        onClose={() => setShowNovoPaciente(false)}
        onSuccess={(p) => {
          setPaciente(p)
          setBuscaPaciente(p.nome ?? p.telefone)
        }}
      />
    </>
  )
}
