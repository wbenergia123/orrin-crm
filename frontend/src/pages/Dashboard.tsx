import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp, Calendar, UserPlus, TrendingDown,
  Users, CalendarDays, BadgeCheck, DollarSign, BarChart3, Video, MapPin, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Metricas {
  faturamentoMes: number
  agendamentosMes: number
  leadsNovos: number
  taxaConversao: number
  deltas: {
    faturamento?: number | null; agendamentos?: number | null; leads?: number | null
    reunioes?: number | null; negocios?: number | null; valorFechado?: number | null
  }
  // agro
  vertical?: 'agro'
  leadsNovosMes?: number
  reunioesMes?: number
  negociosFechadosMes?: number
  valorFechadoMes?: number
  valorEmNegociacao?: number
  funil?: { nome: string; qtd: number }[]
  proximasReunioes?: { id: string; data_hora: string; tipo: 'presencial' | 'virtual'; cliente: string; vendedor: string | null }[]
  ranking?: { nome: string; valor: number; negocios: number }[]
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function AgroDelta({ value }: { value: number | null }) {
  if (value === null) return null
  const up = value >= 0
  const color = up ? '#16a34a' : '#dc2626'
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, fontWeight: 600, color }}>
      <Icon size={11} />
      {up ? '+' : ''}{value}% <span style={{ color: '#9ca3af', fontWeight: 400 }}>vs mês anterior</span>
    </div>
  )
}

interface PontoDiario { data: string; agendamentos: number; mensagens: number }
interface StatusItem { status: string; nome: string; count: number; percentual: number; cor: string }
interface StatusData { total: number; itens: StatusItem[] }
interface PontoDia { dia: string; agendamentos: number }

const formatDay = (iso: string) =>
  format(new Date(iso + 'T12:00:00'), 'd MMM', { locale: ptBR })

function Delta({ value }: { value: number | null }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{value}%
    </span>
  )
}

function SparkTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-md shadow px-2 py-1 text-xs font-medium text-gray-700">
      {payload[0].value}
    </div>
  )
}

function MainTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label ? formatDay(label) : ''}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const mesAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const [mesAgro, setMesAgro] = useState(mesAtual)
  const { data, isLoading } = useQuery<Metricas>({
    queryKey: ['dashboard-metricas', mesAgro],
    queryFn: async () => (await api.get(`/dashboard/metricas?mes=${mesAgro}`)).data,
    refetchInterval: 30_000,
  })

  const { data: grafico = [] } = useQuery<PontoDiario[]>({
    queryKey: ['dashboard-grafico'],
    queryFn: async () => (await api.get('/dashboard/grafico')).data,
    refetchInterval: 60_000,
  })

  const { data: statusData } = useQuery<StatusData>({
    queryKey: ['dashboard-status'],
    queryFn: async () => (await api.get('/dashboard/status-pacientes')).data,
    refetchInterval: 60_000,
  })

  const { data: semana = [] } = useQuery<PontoDia[]>({
    queryKey: ['dashboard-semana'],
    queryFn: async () => (await api.get('/dashboard/agendamentos-semana')).data,
    refetchInterval: 60_000,
  })

  const sparkline = grafico.slice(-14)
  const tickIndexes = new Set([0, 4, 9, 14, 19, 24, 29])

  const cards = useMemo(() => [
    {
      title: 'Faturamento do Mês',
      value: data
        ? `R$ ${Number(data.faturamentoMes).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '—',
      delta: data?.deltas?.faturamento ?? null,
      icon: TrendingUp,
      color: '#7c3aed',
      spark: sparkline.map((d) => ({ v: d.agendamentos })),
    },
    {
      title: 'Agendamentos',
      value: data ? String(data.agendamentosMes) : '—',
      delta: data?.deltas?.agendamentos ?? null,
      icon: Calendar,
      color: '#0891b2',
      spark: sparkline.map((d) => ({ v: d.agendamentos })),
    },
    {
      title: 'Pacientes Novos',
      value: data ? String(data.leadsNovos) : '—',
      delta: data?.deltas?.leads ?? null,
      icon: UserPlus,
      color: '#059669',
      spark: sparkline.map((d) => ({ v: d.mensagens })),
    },
  ], [data, sparkline])

  // Top 2 status for the donut center
  const topStatus = statusData?.itens[0]

  if (data?.vertical === 'agro') {
    const d = data
    const [ay, am] = mesAtual.split('-').map(Number)
    const meses = Array.from({ length: 12 }, (_, i) => {
      let m = am - i, y = ay
      while (m <= 0) { m += 12; y -= 1 }
      const val = `${y}-${String(m).padStart(2, '0')}`
      const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      return { val, label }
    })
    const funil = d.funil ?? []
    const maxFunil = Math.max(1, ...funil.map((e) => e.qtd))
    const ranking = d.ranking ?? []
    const maxRank = Math.max(1, ...ranking.map((v) => v.valor))
    const reunioes = d.proximasReunioes ?? []
    const fmtDataHora = (s: string) => {
      const [dia, hora] = s.split('T')
      const [, m, day] = dia.split('-')
      return `${day}/${m} · ${(hora ?? '').slice(0, 5)}`
    }
    const card = { background: '#fff', borderRadius: 16, boxShadow: '0 8px 24px rgba(31,41,55,0.07)' } as const
    const kpis = [
      { label: 'Leads novos (mês)', value: String(d.leadsNovosMes ?? 0), delta: d.deltas?.leads ?? null, Icon: Users },
      { label: 'Reuniões (mês)', value: String(d.reunioesMes ?? 0), delta: d.deltas?.reunioes ?? null, Icon: CalendarDays },
      { label: 'Negócios fechados (mês)', value: String(d.negociosFechadosMes ?? 0), delta: d.deltas?.negocios ?? null, Icon: BadgeCheck },
      { label: 'Valor fechado (mês)', value: brl(d.valorFechadoMes ?? 0), delta: d.deltas?.valorFechado ?? null, Icon: DollarSign, small: true },
    ]
    return (
      <div className="space-y-7">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">Visão geral de vendas</p>
          </div>
          <select
            value={mesAgro}
            onChange={(e) => setMesAgro(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 capitalize"
          >
            {meses.map((m) => (
              <option key={m.val} value={m.val} className="capitalize">{m.label}</option>
            ))}
          </select>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 20 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ ...card, padding: '22px 22px 20px' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <k.Icon size={16} color="#7c3aed" />
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>{k.label}</div>
              <div style={{ fontSize: k.small ? 24 : 30, fontWeight: 700, marginTop: k.small ? 6 : 4, color: '#1f2937' }}>{k.value}</div>
              <AgroDelta value={k.delta} />
            </div>
          ))}
          <div style={{ ...card, padding: '22px 22px 20px', boxShadow: '0 14px 34px rgba(124,58,237,0.18)', border: '1px solid #ede9fe', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 22, right: 22, height: 3, borderRadius: '0 0 3px 3px', background: '#7c3aed' }} />
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <BarChart3 size={16} color="#fff" />
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c3aed' }}>Valor em negociação</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: '#5b21b6' }}>{brl(d.valorEmNegociacao ?? 0)}</div>
          </div>
        </div>

        {/* Funil + Próximas reuniões */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 20 }}>
          <div style={{ ...card, padding: '26px 28px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#1f2937' }}>Funil de vendas</h2>
            <p style={{ margin: '0 0 22px', fontSize: 12, color: '#9ca3af' }}>Negócios ativos por etapa</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {funil.map((e) => (
                <div key={e.nome}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 5 }}>{e.nome}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div title={`${e.nome}: ${e.qtd}`} style={{ height: 14, borderRadius: 99, background: '#7c3aed', width: `${Math.round((e.qtd / maxFunil) * 100)}%`, minWidth: 14, transition: 'width .4s ease' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{e.qtd}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: '26px 28px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#1f2937' }}>Próximas reuniões</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#9ca3af' }}>Agenda da equipe</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {reunioes.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < reunioes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.cliente}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{r.vendedor ? `Vend. ${r.vendedor}` : 'Sem vendedor'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDataHora(r.data_hora)}</div>
                  {r.tipo === 'virtual' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', borderRadius: 99, padding: '4px 10px' }}><Video size={12} /> Virtual</span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#374151', background: '#f3f4f6', borderRadius: 99, padding: '4px 10px' }}><MapPin size={12} /> Presencial</span>
                  )}
                </div>
              ))}
              {reunioes.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma reunião futura.</p>}
            </div>
          </div>
        </div>

        {/* Ranking */}
        <div style={{ ...card, padding: '26px 28px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#1f2937' }}>Ranking de vendedores</h2>
          <p style={{ margin: '0 0 22px', fontSize: 12, color: '#9ca3af' }}>Valor fechado no mês, do maior para o menor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ranking.map((v) => (
              <div key={v.nome} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ede9fe', color: '#6d28d9', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{v.nome[0]}</div>
                <div style={{ width: 110, fontSize: 13, fontWeight: 500, flexShrink: 0, color: '#1f2937' }}>{v.nome}</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div title={`${v.nome}: ${brl(v.valor)} · ${v.negocios} negócio(s)`} style={{ height: 14, borderRadius: 99, background: '#7c3aed', width: `${Math.round((v.valor / maxRank) * 100)}%`, minWidth: 14, transition: 'width .4s ease' }} />
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: '#1f2937' }}>{brl(v.valor)}</div>
                </div>
              </div>
            ))}
            {ranking.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum negócio fechado no mês.</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>

      {/* ── Metric cards with sparkline ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
        {cards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm overflow-hidden min-w-0">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {card.title}
                </CardTitle>
                <Delta value={card.delta} />
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-0">
              <p className="text-2xl font-bold text-gray-900 mb-3">
                {isLoading
                  ? <span className="inline-block w-24 h-7 bg-gray-100 animate-pulse rounded" />
                  : card.value}
              </p>
            </CardContent>
            <div className="h-16 relative">
              {card.spark.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={card.spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`sg-${card.title}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={card.color} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={card.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparkTooltip />} />
                    <Area type="monotone" dataKey="v" stroke={card.color} strokeWidth={2}
                      fill={`url(#sg-${card.title})`} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full bg-gray-50 rounded" />
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* ── Main chart ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-800">Atividade</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Últimos 30 dias</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-3 h-0.5 rounded-full bg-[#7c3aed] inline-block" />
                Agendamentos
              </span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-3 h-0.5 rounded-full bg-[#0891b2] inline-block" />
                Mensagens
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-4 relative">
          {grafico.length > 0 ? (
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <AreaChart data={grafico} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gAgend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0891b2" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="data"
                tickFormatter={(v, i) => tickIndexes.has(i) ? formatDay(v) : ''}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<MainTooltip />} />
              <Area type="monotone" dataKey="agendamentos" name="Agendamentos"
                stroke="#7c3aed" strokeWidth={2.5} fill="url(#gAgend)" dot={false}
                activeDot={{ r: 5, fill: '#7c3aed', strokeWidth: 0 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="mensagens" name="Mensagens"
                stroke="#0891b2" strokeWidth={2.5} fill="url(#gMsg)" dot={false}
                activeDot={{ r: 5, fill: '#0891b2', strokeWidth: 0 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          ) : (
            <div className="h-[240px] bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
              Sem dados
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom row: donut + bar ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">

        {/* Donut — pacientes por status */}
        <Card className="border-0 shadow-sm min-w-0">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-800">Pacientes por Status</CardTitle>
            <p className="text-xs text-gray-400">{statusData?.total ?? 0} pacientes total</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="flex items-center gap-6">
              <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                {(statusData?.itens.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie
                        data={statusData?.itens ?? []}
                        cx="50%" cy="50%"
                        innerRadius={42} outerRadius={58}
                        dataKey="count" paddingAngle={3}
                        isAnimationActive={false}
                      >
                        {(statusData?.itens ?? []).map((item) => (
                          <Cell key={item.status} fill={item.cor} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full bg-gray-50 rounded-full" />
                )}
                {topStatus && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold text-gray-900">{topStatus.percentual}%</span>
                    <span className="text-[10px] text-gray-400 text-center leading-tight">{topStatus.nome}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                {(statusData?.itens ?? []).map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.cor }} />
                      <span className="text-xs text-gray-600">{item.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">{item.count}</span>
                      <span className="text-[10px] text-gray-400 w-7 text-right">{item.percentual}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bar — agendamentos por dia da semana */}
        <Card className="border-0 shadow-sm min-w-0">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-800">Agendamentos por Dia</CardTitle>
            <p className="text-xs text-gray-400">Distribuição semanal histórica</p>
          </CardHeader>
          <CardContent className="px-3 pb-4 relative">
            {semana.length > 0 ? (
              <ResponsiveContainer width="100%" height={160} minWidth={0}>
                <BarChart data={semana} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f5f3ff' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-white border border-gray-100 rounded-lg shadow px-3 py-2 text-xs">
                        <span className="font-semibold text-gray-800">{payload[0].value} agendamentos</span>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="agendamentos" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {semana.map((_, i) => (
                    <Cell key={i} fill={i === 0 || i === 6 ? '#e9d5ff' : '#7c3aed'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-[160px] bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
