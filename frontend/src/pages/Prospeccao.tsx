import { useQuery } from "@tanstack/react-query"
import api from "../lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Phone, Calendar, TrendingUp, TrendingDown } from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts"

interface Cliente {
  id: string
  status: string
  created_at: string
}

interface PontoDia {
  data: string
  leads: number
}

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

export default function Prospeccao() {
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const res = await api.get("/api/clientes")
      return res.data
    },
  })

  const { data: reunioes = [] } = useQuery({
    queryKey: ["reunioes"],
    queryFn: async () => {
      const res = await api.get("/api/reunioes")
      return res.data
    },
  })

  const total = clientes.length
  const contatados = clientes.filter((c: Cliente) => c.status !== "novo").length
  const emReuniao = clientes.filter((c: Cliente) => c.status === "reuniao_agendada").length
  const convertidos = clientes.filter((c: Cliente) => c.status === "cliente").length
  const taxaConversao = total > 0 ? Math.round((convertidos / total) * 100) : 0

  const leadsPorDia: PontoDia[] = clientes.reduce((acc: PontoDia[], c: Cliente) => {
    const data = new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    const existing = acc.find((d) => d.data === data)
    if (existing) { existing.leads += 1 } else { acc.push({ data, leads: 1 }) }
    return acc
  }, []).slice(-14)

  const funnelData = [
    { name: "Leads", value: total },
    { name: "Contatados", value: contatados },
    { name: "Reuniões", value: emReuniao },
    { name: "Clientes", value: convertidos },
  ]

  const cards = [
    { title: "Total de Leads", value: total, icon: Users, color: "#7c3aed", delta: null },
    { title: "Contatados", value: contatados, icon: Phone, color: "#0891b2", delta: null },
    { title: "Reuniões Agendadas", value: reunioes.length, icon: Calendar, color: "#059669", delta: null },
    { title: "Taxa de Conversão", value: `${taxaConversao}%`, icon: TrendingUp, color: "#d97706", delta: null },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm overflow-hidden">
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
                  ? <span className="inline-block w-16 h-7 bg-gray-100 animate-pulse rounded" />
                  : card.value}
              </p>
            </CardContent>
            <div className="h-14">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={leadsPorDia} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`sg-${card.title}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={card.color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={card.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<SparkTooltip />} />
                  <Area type="monotone" dataKey="leads" stroke={card.color} strokeWidth={2}
                    fill={`url(#sg-${card.title})`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-800">Leads por Dia</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Últimos 14 dias</p>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={leadsPorDia} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<SparkTooltip />} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="#7c3aed" strokeWidth={2.5}
                  fill="url(#gLeads)" dot={false} activeDot={{ r: 5, fill: '#7c3aed', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-800">Funil de Vendas</CardTitle>
            <p className="text-xs text-gray-400">{total} leads no total</p>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f5f3ff' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-white border border-gray-100 rounded-lg shadow px-3 py-2 text-xs">
                        <span className="font-semibold text-gray-800">{payload[0].value} leads</span>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
