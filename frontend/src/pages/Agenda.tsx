import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Plus, X, Ban } from 'lucide-react'
import { api } from '../api/client'
import type { Agendamento, BloqueioAgenda, Profissional } from '../types'
import { NovoAgendamentoModal } from '../components/NovoAgendamentoModal'
import { AgendamentoPainel } from '../components/AgendamentoPainel'
import { BloqueioModal } from '../components/BloqueioModal'
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

function EventoCalendario({ event }: { event: { resource: Agendamento | BloqueioAgenda } }) {
  const r = event.resource
  if ('motivo' in r) {
    return (
      <div className="px-1.5 py-1 h-full overflow-hidden">
        <div className="font-semibold text-xs leading-tight truncate">
          {r.motivo || 'Bloqueado'}
        </div>
      </div>
    )
  }
  const ag = r as Agendamento
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

  const [menuSlot, setMenuSlot] = useState<{ x: number; y: number; start: Date } | null>(null)
  const [modalBloqueio, setModalBloqueio] = useState(false)
  const [dataBloqueio, setDataBloqueio] = useState<Date | null>(null)

  const { data: todosAgendamentos = [] } = useQuery<Agendamento[]>({
    queryKey: ['agendamentos-agenda'],
    queryFn: async () => (await api.get('/agendamentos')).data,
    refetchInterval: 30_000,
  })

  const { data: todosProfissionais = [] } = useQuery<Profissional[]>({
    queryKey: ['profissionais-todos'],
    queryFn: async () => (await api.get('/profissionais')).data,
  })

  const { data: bloqueios = [] } = useQuery<BloqueioAgenda[]>({
    queryKey: ['bloqueios-agenda'],
    queryFn: async () => (await api.get('/bloqueios')).data,
  })

  const excluirBloqueio = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/bloqueios/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bloqueios-agenda'] })
      qc.invalidateQueries({ queryKey: ['agendamentos-agenda'] })
    },
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
    const agendamentos = todosAgendamentos
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

    const bloqueiosProf = bloqueios
      .filter((b) => b.profissional_id === profissionalSelecionado.id)
      .map((b) => ({
        id: b.id,
        title: b.motivo || 'Bloqueado',
        start: new Date(b.data_hora_inicio),
        end: new Date(b.data_hora_fim),
        resource: b,
      }))

    return [...agendamentos, ...bloqueiosProf]
  }, [todosAgendamentos, bloqueios, profissionalSelecionado])

  const handleSelectSlot = ({ start, box }: { start: Date; box?: { x: number; y: number } }) => {
    if (!box) return
    setMenuSlot({ x: box.x, y: box.y, start })
  }

  const handleCriarAgendamento = () => {
    if (!menuSlot) return
    setDataHoraInicial(menuSlot.start)
    setMenuSlot(null)
    setModalAberto(true)
  }

  const handleCriarBloqueio = () => {
    if (!menuSlot || !profissionalSelecionado) return
    setDataBloqueio(menuSlot.start)
    setMenuSlot(null)
    setModalBloqueio(true)
  }

  const handleExcluirBloqueio = (bloqueio: BloqueioAgenda) => {
    if (!confirm(`Remover bloqueio "${bloqueio.motivo || 'Bloqueado'}"?`)) return
    excluirBloqueio.mutate(bloqueio.id)
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
              onSelectEvent={(event) => {
                const r = event.resource as Agendamento | BloqueioAgenda
                if ('motivo' in r) {
                  handleExcluirBloqueio(r)
                } else {
                  setAgendamentoAberto(r.id)
                }
              }}
              selectable
              onSelectSlot={handleSelectSlot}
              min={new Date(0, 0, 0, 7, 0)}
              max={new Date(0, 0, 0, 19, 0)}
              scrollToTime={new Date(0, 0, 0, 8, 0)}
              components={{ event: EventoCalendario }}
              eventPropGetter={(event) => {
                const r = event.resource as Agendamento | BloqueioAgenda
                if ('motivo' in r) {
                  return {
                    style: { backgroundColor: '#9ca3af', borderColor: '#6b7280', color: '#fff' },
                    className: 'cursor-pointer',
                  }
                }
                return {}
              }}
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

      {modalBloqueio && profissionalSelecionado && dataBloqueio && (
        <BloqueioModal
          open={modalBloqueio}
          profissional={profissionalSelecionado}
          dataInicial={dataBloqueio}
          onClose={() => { setModalBloqueio(false); setDataBloqueio(null) }}
          onSucesso={() => {
            qc.invalidateQueries({ queryKey: ['bloqueios-agenda'] })
            qc.invalidateQueries({ queryKey: ['agendamentos-agenda'] })
          }}
        />
      )}

      {menuSlot && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuSlot(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-52"
            style={{ top: menuSlot.y, left: menuSlot.x }}
          >
          <button
            onClick={handleCriarAgendamento}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-violet-50 flex items-center gap-2"
          >
            <Plus size={14} /> Novo agendamento
          </button>
          <button
            onClick={handleCriarBloqueio}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-violet-50 flex items-center gap-2"
          >
            <Ban size={14} /> Bloquear horário
          </button>
          <button
            onClick={() => setMenuSlot(null)}
            className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
          >
            <X size={14} /> Cancelar
          </button>
        </div>
        </>
      )}
    </div>
  )
}
