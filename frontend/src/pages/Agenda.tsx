import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Plus } from 'lucide-react'
import { api } from '../api/client'
import type { Agendamento, Profissional } from '../types'
import { NovoAgendamentoModal } from '../components/NovoAgendamentoModal'
import { AgendamentoPainel } from '../components/AgendamentoPainel'
import { getAvatarUrl, getAvatarFallback } from '../lib/avatar'

const locales = { 'pt-BR': ptBR }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
})

const messages = {
  today: 'Hoje',
  previous: 'Anterior',
  next: 'Próximo',
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Lista',
  noEventsInRange: 'Nenhuma consulta neste período',
  showMore: (count: number) => `+${count} mais`,
}

function EventoCalendario({ event }: { event: { resource: Agendamento } }) {
  const ag = event.resource
  return (
    <div className="px-1.5 py-1 h-full overflow-hidden">
      <div className="font-semibold text-xs leading-tight truncate">
        {ag.servico?.nome ?? 'Consulta'}
      </div>
      {ag.paciente?.nome && (
        <div className="text-xs opacity-80 truncate mt-0.5">{ag.paciente.nome}</div>
      )}
    </div>
  )
}

function CardProfissional({
  profissional,
  consultasHoje,
  selecionado,
  inativo,
  onClick,
}: {
  profissional: Profissional
  consultasHoje: number
  selecionado: boolean
  inativo: boolean
  onClick: () => void
}) {
  const avatarSrc = getAvatarUrl(profissional)
  const fallbackSrc = getAvatarFallback(profissional.nome)
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all shrink-0 text-left ${
        selecionado
          ? 'border-violet-500 bg-violet-50'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
      } ${inativo ? 'opacity-50' : ''}`}
    >
      <img
        src={avatarSrc}
        alt={profissional.nome}
        className="w-10 h-10 rounded-full shrink-0 object-cover"
        onError={(e) => { e.currentTarget.src = fallbackSrc }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold truncate ${selecionado ? 'text-violet-700' : 'text-gray-800'}`}>
            {profissional.nome}
          </p>
          {inativo && (
            <span className="text-[10px] font-semibold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">
              Inativo
            </span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${selecionado ? 'text-violet-500' : 'text-gray-400'}`}>
          {consultasHoje} consulta{consultasHoje !== 1 ? 's' : ''} hoje
        </p>
      </div>
    </button>
  )
}

export function Agenda() {
  const qc = useQueryClient()
  const [view, setView] = useState<View>('day')
  const [date, setDate] = useState(new Date())
  const [profissionalSelecionadoId, setProfissionalSelecionadoId] = useState<string | null>(null)
  const [agendamentoAberto, setAgendamentoAberto] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [dataHoraInicial, setDataHoraInicial] = useState<Date | null>(null)

  const { data: todosAgendamentos = [] } = useQuery<Agendamento[]>({
    queryKey: ['agendamentos-agenda'],
    queryFn: async () => (await api.get('/agendamentos')).data,
    refetchInterval: 30_000,
  })

  const { data: todosProfissionais = [] } = useQuery<Profissional[]>({
    queryKey: ['profissionais-todos'],
    queryFn: async () => (await api.get('/profissionais')).data,
  })

  const agora = new Date()
  const profissionaisVisiveis = useMemo(() => {
    const temFuturo = new Set(
      todosAgendamentos
        .filter((a) => new Date(a.data_hora) > agora && a.status !== 'cancelado')
        .map((a) => a.profissional_id)
    )
    return todosProfissionais.filter((p) => p.ativo || temFuturo.has(p.id))
  }, [todosProfissionais, todosAgendamentos])

  const profissionalSelecionado = useMemo(() => {
    if (profissionalSelecionadoId) {
      return profissionaisVisiveis.find((p) => p.id === profissionalSelecionadoId) ?? null
    }
    return profissionaisVisiveis.find((p) => p.ativo) ?? profissionaisVisiveis[0] ?? null
  }, [profissionalSelecionadoId, profissionaisVisiveis])

  const hoje = new Date()
  const consultasHojePorProfissional = useMemo(() => {
    const map = new Map<string, number>()
    todosAgendamentos.forEach((a) => {
      const d = new Date(a.data_hora)
      if (
        d.getFullYear() === hoje.getFullYear() &&
        d.getMonth() === hoje.getMonth() &&
        d.getDate() === hoje.getDate() &&
        a.status !== 'cancelado'
      ) {
        map.set(a.profissional_id, (map.get(a.profissional_id) ?? 0) + 1)
      }
    })
    return map
  }, [todosAgendamentos])

  const eventos = useMemo(() => {
    if (!profissionalSelecionado) return []
    return todosAgendamentos
      .filter((ag) => ag.profissional_id === profissionalSelecionado.id)
      .map((ag) => ({
        id: ag.id,
        title: ag.servico?.nome ?? 'Consulta',
        start: new Date(ag.data_hora),
        end: new Date(
          new Date(ag.data_hora).getTime() +
          ((ag.servico as { duracao_minutos?: number } | undefined)?.duracao_minutos ?? 60) * 60 * 1000
        ),
        resource: ag,
      }))
  }, [todosAgendamentos, profissionalSelecionado])

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setDataHoraInicial(start)
    setModalAberto(true)
  }

  const painelAberto = agendamentoAberto !== null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Agenda</h1>
        <button
          onClick={() => { setDataHoraInicial(null); setModalAberto(true) }}
          className="flex items-center gap-1.5 bg-violet-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus size={15} /> Novo agendamento
        </button>
      </div>

      {/* Cards de profissionais */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {profissionaisVisiveis.map((prof) => (
          <CardProfissional
            key={prof.id}
            profissional={prof}
            consultasHoje={consultasHojePorProfissional.get(prof.id) ?? 0}
            selecionado={profissionalSelecionado?.id === prof.id}
            inativo={!prof.ativo}
            onClick={() => setProfissionalSelecionadoId(prof.id)}
          />
        ))}
      </div>

      {/* Calendário + painel */}
      <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: 680 }}>
        <div className={`flex-1 min-w-0 p-4 transition-all ${painelAberto ? 'pr-0' : ''}`}>
          {profissionalSelecionado ? (
            <Calendar
              localizer={localizer}
              events={eventos}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              messages={messages}
              culture="pt-BR"
              onSelectEvent={(event) => setAgendamentoAberto((event.resource as Agendamento).id)}
              selectable
              onSelectSlot={handleSelectSlot}
              min={new Date(0, 0, 0, 7, 0)}
              max={new Date(0, 0, 0, 19, 0)}
              scrollToTime={new Date(0, 0, 0, 8, 0)}
              components={{ event: EventoCalendario }}
              style={{ height: '100%' }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Nenhum profissional encontrado
            </div>
          )}
        </div>

        {painelAberto && agendamentoAberto && (
          <AgendamentoPainel
            agendamentoId={agendamentoAberto}
            onClose={() => setAgendamentoAberto(null)}
            onStatusChange={() => qc.invalidateQueries({ queryKey: ['agendamentos-agenda'] })}
          />
        )}
      </div>

      <NovoAgendamentoModal
        open={modalAberto}
        onClose={() => { setModalAberto(false); setDataHoraInicial(null) }}
        dataHoraInicial={dataHoraInicial}
      />
    </div>
  )
}
