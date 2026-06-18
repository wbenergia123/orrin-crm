import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, MessageCircle, CheckCircle, XCircle, Clock, Calendar, User, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { StatusAgendamento } from '../types'

interface AgendamentoDetalhe {
  id: string
  data_hora: string
  status: StatusAgendamento
  notas: string | null
  servico: { id: string; nome: string; preco: number; duracao_minutos: number }
  profissional: { id: string; nome: string }
  paciente: { id: string; nome: string | null; telefone: string }
  historico: { contagem: number; ultima_data: string | null }
}

const STATUS_LABELS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
}

const STATUS_COLORS: Record<StatusAgendamento, string> = {
  agendado: 'bg-yellow-100 text-yellow-800',
  confirmado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
  concluido: 'bg-gray-100 text-gray-600',
}

export function AgendamentoPainel({
  agendamentoId,
  onClose,
  onStatusChange,
}: {
  agendamentoId: string
  onClose: () => void
  onStatusChange: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)

  const { data: ag, isLoading } = useQuery<AgendamentoDetalhe>({
    queryKey: ['agendamento-detalhe', agendamentoId],
    queryFn: async () => (await api.get(`/agendamentos/${agendamentoId}`)).data,
  })

  const { mutate: atualizarStatus, isPending } = useMutation({
    mutationFn: (status: StatusAgendamento) =>
      api.patch(`/agendamentos/${agendamentoId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamento-detalhe', agendamentoId] })
      qc.invalidateQueries({ queryKey: ['agendamentos-agenda'] })
      onStatusChange()
      setConfirmandoCancelamento(false)
    },
  })

  if (isLoading || !ag) {
    return (
      <div className="w-[400px] border-l border-gray-100 bg-white flex items-center justify-center">
        <div className="text-gray-400 text-sm">Carregando...</div>
      </div>
    )
  }

  const podeAcionar = ag.status === 'agendado'
  const dataHora = new Date(ag.data_hora)

  const textoHistorico = () => {
    if (ag.historico.contagem === 0) return 'Primeira consulta'
    const ordinal = ag.historico.contagem + 1
    const sufixo = ordinal === 2 ? '2ª' : ordinal === 3 ? '3ª' : `${ordinal}ª`
    const ultimaData = ag.historico.ultima_data
      ? format(new Date(ag.historico.ultima_data), 'dd/MM', { locale: ptBR })
      : null
    return ultimaData ? `${sufixo} consulta · última em ${ultimaData}` : `${sufixo} consulta`
  }

  return (
    <div className="w-[400px] border-l border-gray-100 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Detalhes da consulta</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Nome + status */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              {ag.paciente.nome ?? ag.paciente.telefone}
            </h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${STATUS_COLORS[ag.status]}`}>
              {STATUS_LABELS[ag.status]}
            </span>
          </div>
        </div>

        {/* Serviço + data/hora */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar size={15} className="text-gray-400 shrink-0" />
            <span className="font-medium">{ag.servico.nome}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock size={15} className="text-gray-400 shrink-0" />
            <span>{format(dataHora, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock size={15} className="text-transparent shrink-0" />
            <span>{ag.servico.duracao_minutos} minutos</span>
          </div>
        </div>

        {/* Contato + abrir conversa */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={15} className="text-gray-400 shrink-0" />
            <span>{ag.paciente.telefone}</span>
          </div>
          <button
            onClick={() => navigate(`/atendimentos?paciente=${ag.paciente.id}`)}
            className="flex items-center gap-2 text-sm text-violet-600 font-medium hover:text-violet-700 transition-colors"
          >
            <MessageCircle size={15} />
            Abrir conversa
          </button>
        </div>

        {/* Notas */}
        {ag.notas && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <FileText size={12} />
              Notas
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
              {ag.notas}
            </p>
          </div>
        )}

        {/* Histórico */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Histórico</div>
          <p className="text-sm text-gray-600">{textoHistorico()}</p>
        </div>
      </div>

      {/* Ações */}
      {podeAcionar && (
        <div className="px-5 py-4 border-t border-gray-100">
          {confirmandoCancelamento ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700 font-medium">Tem certeza? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => atualizarStatus('cancelado')}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <XCircle size={15} />
                  Sim, cancelar
                </button>
                <button
                  onClick={() => setConfirmandoCancelamento(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => atualizarStatus('confirmado')}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle size={15} />
                Confirmar
              </button>
              <button
                onClick={() => setConfirmandoCancelamento(true)}
                className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 text-sm font-semibold py-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                <XCircle size={15} />
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
