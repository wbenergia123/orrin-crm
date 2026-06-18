import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "../lib/api"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus, Phone, Mail, Building2 } from "lucide-react"

interface Cliente {
  id: string
  telefone: string
  nome: string | null
  empresa: string | null
  email: string | null
  status: string
  created_at: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  novo: { label: "Novo", className: "bg-gray-100 text-gray-600" },
  contato_feito: { label: "Contato feito", className: "bg-yellow-100 text-yellow-700" },
  reuniao_agendada: { label: "Reunião agendada", className: "bg-blue-100 text-blue-700" },
  cliente: { label: "Cliente", className: "bg-emerald-100 text-emerald-700" },
  perdido: { label: "Perdido", className: "bg-red-100 text-red-600" },
}

export default function Clientes() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ telefone: "", nome: "", empresa: "", email: "" })
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState("")

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const res = await api.get("/api/clientes")
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (cliente: typeof form) => {
      return await api.post("/api/clientes", cliente)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] })
      setForm({ telefone: "", nome: "", empresa: "", email: "" })
      setFormOpen(false)
      setError("")
    },
    onError: () => setError("Erro ao adicionar cliente"),
  })

  const handleAdd = () => {
    if (!form.telefone) { setError("Telefone é obrigatório"); return }
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Clientes</h1>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-2 bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-700 transition-colors"
        >
          <UserPlus size={16} />
          Novo Cliente
        </button>
      </div>

      {formOpen && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-800">Novo Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-3 p-2.5 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <input
                type="text"
                placeholder="Telefone (obrigatório)"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Empresa"
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={createMutation.isPending}
                className="bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
              <button
                onClick={() => { setFormOpen(false); setError("") }}
                className="bg-gray-100 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-800">
              {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {isLoading ? (
            <div className="px-5 pb-5 text-sm text-gray-400">Carregando...</div>
          ) : clientes.length === 0 ? (
            <div className="px-5 pb-8 text-center text-sm text-gray-400">
              Nenhum cliente ainda. Adicione o primeiro!
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {clientes.map((cliente: Cliente) => {
                const status = statusConfig[cliente.status] ?? statusConfig.novo
                return (
                  <div key={cliente.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {cliente.nome || "Sem nome"}
                        </p>
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {cliente.empresa && (
                          <span className="flex items-center gap-1">
                            <Building2 size={11} />
                            {cliente.empresa}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Phone size={11} />
                          {cliente.telefone}
                        </span>
                        {cliente.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={11} />
                            {cliente.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
