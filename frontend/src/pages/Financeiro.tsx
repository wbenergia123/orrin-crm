import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Resumo {
  faturamento: number
  ticketMedio: number
  agendamentosConcluidos: number
  agendamentosCancelados: number
  taxaCancelamento: number
  clientesNovos: number
  clientesRecorrentes: number
  deltas: { faturamento: number | null; ticketMedio: number | null; agendamentosConcluidos: number | null }
}

interface Procedimento {
  servico_id: string
  nome: string
  quantidade: number
  receita: number
}

interface ProfissionalFinanceiro {
  profissional_id: string
  nome: string
  atendimentos: number
  receita: number
  comissao_percentual: number
  comissao_estimada: number
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function periodoHoje() {
  const d = new Date()
  return { inicio: formatDate(d), fim: formatDate(d), label: 'Hoje' }
}

function periodoSemana() {
  const fim = new Date()
  const inicio = new Date()
  inicio.setDate(fim.getDate() - 6)
  return { inicio: formatDate(inicio), fim: formatDate(fim), label: 'Semana' }
}

function periodoMes() {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  return { inicio: formatDate(inicio), fim: formatDate(fim), label: 'Mês' }
}

function formatCurrency(value: number) {
  return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

export function Financeiro() {
  const [periodo, setPeriodo] = useState(periodoMes())

  const queryParams = useMemo(
    () => ({ inicio: periodo.inicio, fim: periodo.fim }),
    [periodo]
  )

  const { data: resumo, isLoading: loadingResumo } = useQuery<Resumo>({
    queryKey: ['financeiro-resumo', queryParams],
    queryFn: async () => (await api.get('/financeiro/resumo', { params: queryParams })).data,
  })

  const { data: procedimentos = [], isLoading: loadingProcedimentos } = useQuery<Procedimento[]>({
    queryKey: ['financeiro-procedimentos', queryParams],
    queryFn: async () => (await api.get('/financeiro/por-procedimento', { params: queryParams })).data,
  })

  const { data: profissionais = [], isLoading: loadingProfissionais } = useQuery<ProfissionalFinanceiro[]>({
    queryKey: ['financeiro-profissionais', queryParams],
    queryFn: async () => (await api.get('/financeiro/por-profissional', { params: queryParams })).data,
  })

  const botoes = [
    { label: 'Hoje', fn: periodoHoje },
    { label: 'Semana', fn: periodoSemana },
    { label: 'Mês', fn: periodoMes },
  ]

  const cards = [
    {
      title: 'Faturamento',
      value: resumo ? formatCurrency(resumo.faturamento) : '—',
      delta: resumo?.deltas.faturamento ?? null,
      icon: DollarSign,
    },
    {
      title: 'Ticket médio',
      value: resumo ? formatCurrency(resumo.ticketMedio) : '—',
      delta: resumo?.deltas.ticketMedio ?? null,
      icon: Calendar,
    },
    {
      title: 'Taxa de cancelamento',
      value: resumo ? `${resumo.taxaCancelamento}%` : '—',
      delta: null,
      icon: TrendingDown,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">Financeiro</h1>
        <div className="flex flex-wrap items-center gap-2">
          {botoes.map((b) => (
            <button
              key={b.label}
              onClick={() => setPeriodo(b.fn())}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodo.label === b.label
                  ? 'bg-violet-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {b.label}
            </button>
          ))}
          <input
            type="date"
            value={periodo.inicio}
            onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700"
          />
          <span className="text-sm text-gray-400">até</span>
          <input
            type="date"
            value={periodo.fim}
            onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-gray-400 uppercase tracking-wide">{card.title}</CardTitle>
                <Delta value={card.delta} />
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <p className="text-2xl font-bold text-gray-900">
                {loadingResumo ? <span className="inline-block w-24 h-7 bg-gray-100 animate-pulse rounded" /> : card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-800">Procedimentos</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Nome</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Qtd.</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProcedimentos ? (
                    <tr><td colSpan={3} className="px-3 py-3 text-gray-400">Carregando...</td></tr>
                  ) : procedimentos.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-3 text-gray-400">Nenhum procedimento no período</td></tr>
                  ) : (
                    procedimentos.map((p) => (
                      <tr key={p.servico_id} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{p.nome}</td>
                        <td className="px-3 py-2 text-gray-600">{p.quantidade}</td>
                        <td className="px-3 py-2 text-gray-600">{formatCurrency(p.receita)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-800">Profissionais</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Nome</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Atend.</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Receita</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProfissionais ? (
                    <tr><td colSpan={4} className="px-3 py-3 text-gray-400">Carregando...</td></tr>
                  ) : profissionais.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-3 text-gray-400">Nenhum profissional no período</td></tr>
                  ) : (
                    profissionais.map((p) => (
                      <tr key={p.profissional_id} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{p.nome}</td>
                        <td className="px-3 py-2 text-gray-600">{p.atendimentos}</td>
                        <td className="px-3 py-2 text-gray-600">{formatCurrency(p.receita)}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.comissao_percentual}% ({formatCurrency(p.comissao_estimada)})
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
