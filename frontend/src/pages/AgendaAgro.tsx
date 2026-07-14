import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Plus } from 'lucide-react'
import { api } from '../api/client'
import type { ReuniaoAgro } from '../types'
import { NovaReuniaoModal } from '../components/NovaReuniaoModal'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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
  noEventsInRange: 'Nenhuma reunião neste período',
  showMore: (count: number) => `+${count} mais`,
}

const statusLabel: Record<ReuniaoAgro['status'], string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  realizada: 'Realizada',
}

export function AgendaAgro() {
  const qc = useQueryClient()
  const [view, setView] = useState<View>('week')
  const [date, setDate] = useState(new Date())
  const [modalAberto, setModalAberto] = useState(false)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined)
  const [reuniaoAberta, setReuniaoAberta] = useState<ReuniaoAgro | null>(null)

  const { data: reunioes = [] } = useQuery<ReuniaoAgro[]>({
    queryKey: ['reunioes-agro'],
    queryFn: async () => (await api.get('/reunioes-agro')).data,
    refetchInterval: 30_000,
  })

  const alterarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReuniaoAgro['status'] }) =>
      api.patch(`/reunioes-agro/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reunioes-agro'] })
      setReuniaoAberta(null)
    },
  })

  const eventos = reunioes
    .filter((r) => r.status !== 'cancelada')
    .map((r) => ({
      id: r.id,
      title: `${r.tipo === 'virtual' ? '📹 ' : ''}${r.pacientes?.nome ?? r.pacientes?.telefone ?? 'Cliente'} — ${r.profissionais?.nome ?? 'sem vendedor'}`,
      start: new Date(r.data_hora),
      end: new Date(new Date(r.data_hora).getTime() + 60 * 60 * 1000),
      resource: r,
    }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Agenda</h1>
        <button
          onClick={() => { setDefaultDate(undefined); setModalAberto(true) }}
          className="flex items-center gap-1.5 bg-violet-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus size={15} /> Nova reunião
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: 680 }}>
        <div className="h-full p-4">
          <Calendar
            localizer={localizer}
            events={eventos}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            messages={messages}
            culture="pt-BR"
            onSelectEvent={(event) => setReuniaoAberta(event.resource as ReuniaoAgro)}
            selectable
            onSelectSlot={({ start }) => { setDefaultDate(start); setModalAberto(true) }}
            min={new Date(0, 0, 0, 7, 0)}
            max={new Date(0, 0, 0, 19, 0)}
            scrollToTime={new Date(0, 0, 0, 8, 0)}
            style={{ height: '100%' }}
          />
        </div>
      </div>

      <NovaReuniaoModal
        open={modalAberto}
        onClose={() => { setModalAberto(false); setDefaultDate(undefined) }}
        defaultDate={defaultDate}
      />

      <Dialog open={!!reuniaoAberta} onOpenChange={(o) => !o && setReuniaoAberta(null)}>
        <DialogContent className="max-w-md">
          {reuniaoAberta && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {reuniaoAberta.tipo === 'virtual' ? '📹' : '🤝'} Reunião
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-2.5 pt-1 text-sm">
                <div>
                  <span className="text-gray-400">Cliente: </span>
                  <span className="font-medium text-gray-800">
                    {reuniaoAberta.pacientes?.nome ?? reuniaoAberta.pacientes?.telefone ?? 'Cliente'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Vendedor: </span>
                  <span className="font-medium text-gray-800">
                    {reuniaoAberta.profissionais?.nome ?? 'sem vendedor'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Quando: </span>
                  <span className="font-medium text-gray-800">
                    {format(new Date(reuniaoAberta.data_hora), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Tipo: </span>
                  <span className="font-medium text-gray-800 capitalize">{reuniaoAberta.tipo}</span>
                </div>
                {reuniaoAberta.tipo === 'virtual' && reuniaoAberta.link_reuniao && (
                  <div>
                    <span className="text-gray-400">Link: </span>
                    <a
                      href={reuniaoAberta.link_reuniao}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 font-medium hover:underline break-all"
                    >
                      {reuniaoAberta.link_reuniao}
                    </a>
                  </div>
                )}
                {reuniaoAberta.tipo === 'presencial' && reuniaoAberta.local && (
                  <div>
                    <span className="text-gray-400">Local: </span>
                    <span className="font-medium text-gray-800">{reuniaoAberta.local}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Status: </span>
                  <span className="font-medium text-gray-800">{statusLabel[reuniaoAberta.status]}</span>
                </div>
                {reuniaoAberta.notas && (
                  <div>
                    <span className="text-gray-400">Notas: </span>
                    <span className="text-gray-700">{reuniaoAberta.notas}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  onClick={() => alterarStatus.mutate({ id: reuniaoAberta.id, status: 'cancelada' })}
                  disabled={alterarStatus.isPending}
                  className="border border-gray-200 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => alterarStatus.mutate({ id: reuniaoAberta.id, status: 'confirmada' })}
                  disabled={alterarStatus.isPending || reuniaoAberta.status === 'confirmada'}
                  className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
