import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, UserPlus, ChevronRight, Phone, CreditCard, ArrowUpDown } from 'lucide-react'
import { api } from '../api/client'
import { parseUtcTimestamp } from '../lib/utils'
import type { Paciente, StatusPaciente } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { NovoPacienteModal } from '../components/NovoPacienteModal'
import { ConversaPanel } from '../components/ConversaPanel'
import { useAuth } from '../hooks/useAuth'

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

function formatCpf(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

type Ordenacao = 'az' | 'za' | 'recentes' | 'antigos' | 'status'

const ORDENACAO_LABELS: Record<Ordenacao, string> = {
  az: 'A → Z',
  za: 'Z → A',
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  status: 'Status',
}

const statusOrder: Record<string, number> = {
  cliente: 0, consulta_agendada: 1, em_conversa: 2, novo: 3, frio: 4,
}

function ordenar(lista: Paciente[], ord: Ordenacao): Paciente[] {
  return [...lista].sort((a, b) => {
    switch (ord) {
      case 'az': return (a.nome ?? a.telefone).localeCompare(b.nome ?? b.telefone, 'pt-BR')
      case 'za': return (b.nome ?? b.telefone).localeCompare(a.nome ?? a.telefone, 'pt-BR')
      case 'recentes': return parseUtcTimestamp(b.created_at).getTime() - parseUtcTimestamp(a.created_at).getTime()
      case 'antigos': return parseUtcTimestamp(a.created_at).getTime() - parseUtcTimestamp(b.created_at).getTime()
      case 'status': return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    }
  })
}

export function Clientes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { usuario } = useAuth()
  const isAgro = usuario?.vertical === 'agro'
  const termo = isAgro ? 'cliente' : 'paciente'
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recentes')
  const [dropdownOrdem, setDropdownOrdem] = useState(false)
  const [selecionado, setSelecionado] = useState<Paciente | null>(null)

  const handleStatusChange = (status: StatusPaciente) => {
    if (!selecionado) return
    api.patch(`/pacientes/${selecionado.id}/status`, { status })
    setSelecionado((prev) => (prev ? { ...prev, status } : null))
    qc.invalidateQueries({ queryKey: ['clientes'] })
  }

  const { data: pacientes = [], isLoading } = useQuery<Paciente[]>({
    queryKey: ['clientes', buscaAtiva],
    queryFn: async () => {
      const params = buscaAtiva.trim() ? `?busca=${encodeURIComponent(buscaAtiva.trim())}` : ''
      return (await api.get(`/pacientes${params}`)).data
    },
  })

  const handleBusca = (v: string) => {
    setBusca(v)
    setBuscaAtiva(v)
  }

  const sorted = ordenar(pacientes, ordenacao)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Clientes</h1>
          <p className="text-sm text-gray-400 mt-0.5">{pacientes.length} {termo}s cadastrados</p>
        </div>
        <button
          onClick={() => setNovoOpen(true)}
          className="flex items-center gap-1.5 bg-violet-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <UserPlus size={15} /> Novo {termo}
        </button>
      </div>

      {/* Search + sort */}
      <div className="flex gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => handleBusca(e.target.value)}
          placeholder="Buscar por nome, CPF ou telefone..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Sort dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropdownOrdem((v) => !v)}
          className="flex items-center gap-2 border border-gray-200 bg-white px-3.5 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          <ArrowUpDown size={14} />
          {ORDENACAO_LABELS[ordenacao]}
        </button>
        {dropdownOrdem && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
            {(Object.keys(ORDENACAO_LABELS) as Ordenacao[]).map((key) => (
              <button
                key={key}
                onClick={() => { setOrdenacao(key); setDropdownOrdem(false) }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  ordenacao === key ? 'text-violet-600 font-semibold bg-violet-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {ORDENACAO_LABELS[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_-4px_rgba(16,24,40,0.08)] border border-gray-100/80 overflow-hidden">
        {isLoading || sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{isAgro ? 'Cliente' : 'Paciente'}</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CPF</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cadastro</span>
              </div>

              {isLoading ? (
                <div className="divide-y divide-gray-50">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
                        <div className="h-4 w-32 bg-gray-100 rounded" />
                      </div>
                      <div className="h-4 w-28 bg-gray-100 rounded self-center" />
                      <div className="h-4 w-24 bg-gray-100 rounded self-center" />
                      <div className="h-5 w-20 bg-gray-100 rounded-full self-center" />
                      <div className="h-4 w-16 bg-gray-100 rounded self-center" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sorted.map((p) => {
                    const seed = p.nome ?? p.telefone
                    return (
                      <button
                        key={p.id}
                        onClick={() => usuario?.vertical === 'agro' ? setSelecionado(p) : navigate(`/pacientes/${p.id}`)}
                        className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left items-center group"
                      >
                        {/* Nome + avatar */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                            style={{ background: avatarGradient(seed) }}
                          >
                            {getInitials(p.nome, p.telefone)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {p.nome ?? <span className="text-gray-400 italic">Sem nome</span>}
                            </p>
                            {p.email && (
                              <p className="text-xs text-gray-400 truncate">{p.email}</p>
                            )}
                          </div>
                        </div>

                        {/* Telefone */}
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Phone size={13} className="text-gray-400 shrink-0" />
                          {p.telefone}
                        </div>

                        {/* CPF */}
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          {p.cpf ? (
                            <>
                              <CreditCard size={13} className="text-gray-400 shrink-0" />
                              {formatCpf(p.cpf)}
                            </>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>

                        {/* Status */}
                        <div>
                          <StatusBadge status={p.status} />
                        </div>

                        {/* Data + seta */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {format(parseUtcTimestamp(p.created_at), 'd MMM yy', { locale: ptBR })}
                          </span>
                          <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
            <Search size={28} className="opacity-40" />
            <p className="text-sm">Nenhum {termo} encontrado</p>
            {buscaAtiva && (
              <button
                onClick={() => handleBusca('')}
                className="text-violet-600 text-sm font-medium hover:underline"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}
      </div>

      <NovoPacienteModal
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        onSuccess={() => setNovoOpen(false)}
      />

      {selecionado && (
        <ConversaPanel
          paciente={selecionado}
          onClose={() => setSelecionado(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
