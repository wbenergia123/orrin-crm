import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, MessageCircle, Calendar, Phone, Mail, TrendingUp, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { api } from '../api/client'
import type { Paciente, Agendamento, Conversa } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { StatusStepper } from '../components/StatusStepper'

const GRADIENTS = [
  ['#7c3aed', '#a855f7'], ['#2563eb', '#60a5fa'], ['#059669', '#34d399'],
  ['#dc2626', '#f87171'], ['#d97706', '#fbbf24'], ['#0891b2', '#22d3ee'],
  ['#be185d', '#f472b6'], ['#4f46e5', '#818cf8'],
]
function avatarGradient(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  const [a, b] = GRADIENTS[Math.abs(h) % GRADIENTS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}
function getInitials(nome: string | null, telefone: string) {
  if (nome) {
    const parts = nome.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase()
  }
  return telefone.replace(/\D/g, '').slice(-2)
}

const STATUS_AG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  concluido:  { label: 'Concluído',  color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle2 },
  confirmado: { label: 'Confirmado', color: 'text-blue-600 bg-blue-50',       icon: CheckCircle2 },
  agendado:   { label: 'Agendado',   color: 'text-amber-600 bg-amber-50',     icon: Clock },
  cancelado:  { label: 'Cancelado',  color: 'text-red-400 bg-red-50',         icon: XCircle },
}

export function FichaPaciente() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: paciente, isLoading } = useQuery<Paciente>({
    queryKey: ['paciente', id],
    queryFn: async () => (await api.get(`/pacientes/${id}`)).data,
    enabled: !!id,
  })

  const { data: agendamentos = [] } = useQuery<Agendamento[]>({
    queryKey: ['agendamentos-paciente', id],
    queryFn: async () => (await api.get(`/agendamentos?paciente_id=${id}`)).data,
    enabled: !!id,
  })

  const { data: conversas = [] } = useQuery<Conversa[]>({
    queryKey: ['conversas-paciente', id],
    queryFn: async () => (await api.get(`/atendimentos/${id}/conversas`)).data,
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4 animate-pulse">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    )
  }
  if (!paciente) return <div className="text-gray-400 p-4">Paciente não encontrado</div>

  const seed = paciente.nome ?? paciente.telefone
  const concluidas = agendamentos.filter(a => a.status === 'concluido')
  const proxima = agendamentos.find(a => new Date(a.data_hora) > new Date() && a.status !== 'cancelado')
  const totalGasto = concluidas.reduce((sum, a) => sum + (a.servico?.preco ?? 0), 0)
  const ultimaConversa = conversas[conversas.length - 1]

  return (
    <div className="max-w-4xl space-y-5">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft size={15} /> Voltar
      </button>

      {/* ── Header card ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-xl shrink-0"
              style={{ background: avatarGradient(seed) }}
            >
              {getInitials(paciente.nome, paciente.telefone)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900">{paciente.nome ?? 'Sem nome'}</h1>
                <StatusBadge status={paciente.status} />
              </div>
              <div className="flex flex-wrap gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-sm text-gray-400">
                  <Phone size={13} /> {paciente.telefone}
                </span>
                {paciente.email && (
                  <span className="flex items-center gap-1 text-sm text-gray-400">
                    <Mail size={13} /> {paciente.email}
                  </span>
                )}
                <span className="text-sm text-gray-400">
                  Cliente desde {format(new Date(paciente.created_at), 'MMM yyyy', { locale: ptBR })}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigate(`/atendimentos?paciente=${id}`)}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <MessageCircle size={14} /> Conversa
            </button>
            <button
              onClick={() => navigate('/agenda')}
              className="flex items-center gap-1.5 bg-violet-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Calendar size={14} /> Agendar
            </button>
          </div>
        </div>

        <div className="mt-5">
          <StatusStepper status={paciente.status} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Consultas realizadas',
            value: concluidas.length,
            sub: concluidas.length === 0 ? 'Nenhuma ainda' : `${agendamentos.filter(a => a.status === 'cancelado').length} canceladas`,
            icon: CheckCircle2,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Total gasto',
            value: `R$ ${totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            sub: concluidas.length > 0 ? `Ticket médio R$ ${Math.round(totalGasto / concluidas.length).toLocaleString('pt-BR')}` : 'Sem consultas concluídas',
            icon: TrendingUp,
            color: 'text-violet-600',
            bg: 'bg-violet-50',
          },
          {
            label: 'Próxima consulta',
            value: proxima ? format(new Date(proxima.data_hora), 'd MMM', { locale: ptBR }) : '—',
            sub: proxima ? `${proxima.servico?.nome ?? '—'} · ${format(new Date(proxima.data_hora), 'HH:mm')}` : 'Nenhum agendamento futuro',
            icon: Calendar,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium">{stat.label}</p>
              <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                <stat.icon size={14} className={stat.color} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Agendamentos ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Consultas <span className="text-gray-400 font-normal ml-1">{agendamentos.length}</span>
        </h2>
        {agendamentos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma consulta registrada</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {[...agendamentos]
              .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())
              .map((ag) => {
                const s = STATUS_AG[ag.status] ?? STATUS_AG.agendado
                const Icon = s.icon
                return (
                  <div key={ag.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.color.split(' ')[1]}`}>
                        <Icon size={15} className={s.color.split(' ')[0]} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{ag.servico?.nome ?? '—'}</p>
                        <p className="text-xs text-gray-400">{ag.profissional?.nome}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-700">
                        {format(new Date(ag.data_hora), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        {ag.servico?.preco && ag.status === 'concluido' && (
                          <span className="text-xs text-emerald-600 font-medium">
                            R$ {ag.servico.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                          {s.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* ── Conversas (preview) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">
            Conversas <span className="text-gray-400 font-normal ml-1">{conversas.length} mensagens</span>
          </h2>
          <button
            onClick={() => navigate(`/atendimentos?paciente=${id}`)}
            className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:text-violet-700 transition-colors"
          >
            <MessageCircle size={13} /> Ver conversa completa
          </button>
        </div>

        {conversas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma conversa registrada</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {conversas.slice(-10).map((c) => (
              <div key={c.id}>
                {c.mensagem_paciente && (
                  <div className="flex justify-start mb-1">
                    <div className="max-w-[75%]">
                      <p className="text-[10px] text-gray-400 mb-0.5 ml-1">
                        {format(new Date(c.created_at), "d MMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <div className="bg-gray-100 text-gray-800 text-sm px-3 py-2 rounded-2xl rounded-tl-sm">
                        {c.mensagem_paciente}
                      </div>
                    </div>
                  </div>
                )}
                {c.mensagem_agente && (
                  <div className="flex justify-end mb-1">
                    <div className="max-w-[75%]">
                      <p className="text-[10px] text-gray-400 mb-0.5 mr-1 text-right">
                        {c.modo_humano ? 'Atendente' : 'Ana (IA)'}
                      </p>
                      <div className="bg-violet-600 text-white text-sm px-3 py-2 rounded-2xl rounded-tr-sm">
                        {c.mensagem_agente}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {conversas.length > 10 && (
              <p className="text-xs text-gray-400 text-center pt-1">
                Mostrando as 10 últimas de {conversas.length} mensagens
              </p>
            )}
          </div>
        )}

        {ultimaConversa && (
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">
            Última mensagem {format(new Date(ultimaConversa.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>

    </div>
  )
}
