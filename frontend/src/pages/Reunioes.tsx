import { useQuery } from "@tanstack/react-query"
import api from "../lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, ExternalLink, Phone, Building2 } from "lucide-react"

interface Cliente {
  id: string
  nome: string | null
  empresa: string | null
  telefone: string
}

interface Reuniao {
  id: string
  cliente_id: string
  data_hora: string
  status: string
  notas: string | null
  link_reuniao?: string
  clientes?: Cliente
}

const statusConfig: Record<string, { label: string; className: string }> = {
  agendada: { label: "Agendada", className: "bg-yellow-100 text-yellow-700" },
  confirmada: { label: "Confirmada", className: "bg-blue-100 text-blue-700" },
  cancelada: { label: "Cancelada", className: "bg-red-100 text-red-600" },
  realizada: { label: "Realizada", className: "bg-emerald-100 text-emerald-700" },
}

const formatData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })

const formatHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

export default function Reunioes() {
  const { data: reunioes = [], isLoading } = useQuery({
    queryKey: ["reunioes"],
    queryFn: async () => {
      const res = await api.get("/api/reunioes")
      return res.data
    },
  })

  const ordenadas: Reuniao[] = [...reunioes].sort(
    (a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
  )

  const proximas = ordenadas.filter((r) => new Date(r.data_hora) >= new Date())
  const passadas = ordenadas.filter((r) => new Date(r.data_hora) < new Date())

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Reuniões</h1>
        <span className="text-sm text-gray-400">{reunioes.length} total</span>
      </div>

      {isLoading ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8 text-center text-sm text-gray-400">
            Carregando...
          </CardContent>
        </Card>
      ) : reunioes.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Calendar size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400">Nenhuma reunião agendada</p>
            <p className="text-xs text-gray-300 mt-1">Quando uma reunião for criada, ela aparecerá aqui</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {proximas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Próximas ({proximas.length})
              </p>
              <div className="space-y-3">
                {proximas.map((r) => (
                  <ReuniaoCard key={r.id} reuniao={r} />
                ))}
              </div>
            </div>
          )}

          {passadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-2">
                Passadas ({passadas.length})
              </p>
              <div className="space-y-3">
                {passadas.map((r) => (
                  <ReuniaoCard key={r.id} reuniao={r} muted />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ReuniaoCard({ reuniao, muted = false }: { reuniao: Reuniao; muted?: boolean }) {
  const status = statusConfig[reuniao.status] ?? statusConfig.agendada

  return (
    <Card className={`border-0 shadow-sm ${muted ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-800 mb-1">
              {reuniao.clientes?.nome || "Cliente sem nome"}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {reuniao.clientes?.empresa && (
                <span className="flex items-center gap-1">
                  <Building2 size={11} />
                  {reuniao.clientes.empresa}
                </span>
              )}
              {reuniao.clientes?.telefone && (
                <span className="flex items-center gap-1">
                  <Phone size={11} />
                  {reuniao.clientes.telefone}
                </span>
              )}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Calendar size={13} className="text-gray-400" />
            {formatData(reuniao.data_hora)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-gray-400" />
            {formatHora(reuniao.data_hora)}
          </span>
          {reuniao.link_reuniao && (
            <a
              href={reuniao.link_reuniao}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-violet-600 hover:text-violet-700 text-xs font-medium"
            >
              <ExternalLink size={12} />
              Entrar na reunião
            </a>
          )}
        </div>
        {reuniao.notas && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border-l-2 border-gray-200">
            {reuniao.notas}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
