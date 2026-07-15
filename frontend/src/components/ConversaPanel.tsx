import { useRef, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, User, X, Send, ExternalLink, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Paciente, Conversa, StatusPaciente } from '../types'
import { StatusPills } from './StatusPills'
import { NovoAgendamentoModal } from './NovoAgendamentoModal'
import { FichaAgro } from './FichaAgro'
import { useAuth } from '../hooks/useAuth'
import { parseUtcTimestamp } from '../lib/utils'

interface ConversaPanelProps {
  paciente: Paciente
  onClose: () => void
  onStatusChange: (status: StatusPaciente) => void
}

export function ConversaPanel({ paciente, onClose, onStatusChange }: ConversaPanelProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [mensagem, setMensagem] = useState('')
  const [modalAgendamento, setModalAgendamento] = useState(false)

  const { data: conversas = [] } = useQuery<Conversa[]>({
    queryKey: ['conversas-painel', paciente.id],
    queryFn: async () => (await api.get(`/atendimentos/${paciente.id}/conversas`)).data,
    refetchInterval: 10_000,
  })

  // modo_humano = true se a conversa mais recente tiver modo_humano=true
  // API retorna ordenado do mais antigo ao mais recente (ascending)
  const ultimaConversa = conversas.length > 0 ? conversas[conversas.length - 1] : null
  const modoHumano = ultimaConversa?.modo_humano === true

  const { mutate: toggleHandoff } = useMutation({
    mutationFn: (modo: boolean) =>
      api.patch(`/atendimentos/${paciente.id}/handoff`, { modo_humano: modo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversas-painel', paciente.id] }),
  })

  const { mutate: enviarMensagem, isPending: enviando } = useMutation({
    mutationFn: (texto: string) =>
      api.post(`/atendimentos/${paciente.id}/mensagem`, { texto }),
    onSuccess: () => {
      setMensagem('')
      qc.invalidateQueries({ queryKey: ['conversas-painel', paciente.id] })
    },
  })

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversas])

  const handleSend = () => {
    if (!mensagem.trim() || enviando || !modoHumano) return
    enviarMensagem(mensagem.trim())
  }

  return (
    <div className="fixed inset-0 z-50 w-full bg-white border-l border-gray-100 flex flex-col overflow-hidden md:static md:inset-auto md:w-[360px] md:flex-shrink-0 md:z-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Conversa
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/pacientes/${paciente.id}`)}
              className="text-gray-400 hover:text-gray-600"
              title="Ver ficha completa"
            >
              <ExternalLink size={14} />
            </button>
            <button
              onClick={() => setModalAgendamento(true)}
              className="text-gray-400 hover:text-gray-600"
              title="Novo agendamento"
            >
              <Calendar size={14} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-base flex-shrink-0">
            {(paciente.nome ?? paciente.telefone).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {paciente.nome ?? '—'}
            </p>
            <p className="text-xs text-gray-400">{paciente.telefone}</p>
          </div>
        </div>
      </div>

      {/* Status pills */}
      <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
        <StatusPills status={paciente.status} onStatusChange={onStatusChange} />
      </div>

      {usuario?.vertical === 'agro' && <FichaAgro paciente={paciente} />}

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {conversas.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">Nenhuma mensagem ainda</p>
        )}
        {conversas.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            {c.mensagem_paciente && (
              <div className="flex flex-col items-start" style={{ maxWidth: '85%' }}>
                <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed">
                  {c.mensagem_paciente}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {format(parseUtcTimestamp(c.created_at), 'HH:mm', { locale: ptBR })}
                </span>
              </div>
            )}
            {c.mensagem_agente && (
              <div className="flex flex-col items-end self-end" style={{ maxWidth: '85%' }}>
                <div className="flex items-center gap-1 text-[10px] mb-0.5 px-1 text-violet-400">
                  {c.tipo_remetente === 'agente'
                    ? <><Bot size={10} /> Agente</>
                    : <><User size={10} /> Secretária</>}
                </div>
                <div className="bg-violet-600 text-white rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed">
                  {c.mensagem_agente}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {format(parseUtcTimestamp(c.created_at), 'HH:mm', { locale: ptBR })}
                </span>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Handoff bar */}
      <div className={[
        'px-4 py-2.5 flex items-center justify-between text-xs font-medium border-t flex-shrink-0',
        modoHumano
          ? 'bg-violet-50 border-violet-100 text-violet-700'
          : 'bg-amber-50 border-amber-100 text-amber-700',
      ].join(' ')}>
        <span className="flex items-center gap-1.5">
          {modoHumano
            ? <><User size={12} /> Você está atendendo</>
            : <><Bot size={12} /> Agente respondendo</>}
        </span>
        <button
          onClick={() => toggleHandoff(!modoHumano)}
          className={[
            'px-3 py-1 rounded-md text-white text-xs font-medium transition-colors',
            modoHumano ? 'bg-violet-600 hover:bg-violet-700' : 'bg-amber-500 hover:bg-amber-600',
          ].join(' ')}
        >
          {modoHumano ? 'Devolver ao agente' : 'Assumir atendimento'}
        </button>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2 items-center flex-shrink-0">
        <input
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!modoHumano}
          placeholder={modoHumano ? 'Digite uma mensagem...' : 'Assuma o atendimento para digitar'}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm outline-none focus:border-violet-300 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={!modoHumano || !mensagem.trim() || enviando}
          className="w-9 h-9 bg-violet-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-700 transition-colors flex-shrink-0"
        >
          <Send size={14} />
        </button>
      </div>

      <NovoAgendamentoModal
        open={modalAgendamento}
        onClose={() => setModalAgendamento(false)}
        pacienteInicial={paciente}
      />
    </div>
  )
}
