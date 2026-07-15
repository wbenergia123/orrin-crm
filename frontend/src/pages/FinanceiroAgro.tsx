import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Pencil, Trash2 } from 'lucide-react'

interface Fechamento {
  id: string
  nome: string
  valor_fechado: number
  data_fechamento: string
  produto: string | null
}
interface AgroFin { totalReceitas: number; fechamentos: Fechamento[] }
interface CategoriaResumo { categoria: string; total: number }
interface DespesasResumo { total: number; categorias: CategoriaResumo[] }
interface Despesa {
  id: string
  data: string
  descricao: string
  categoria: string
  valor: number
  fixa: boolean
  notas: string | null
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmt = (v: number) => brl.format(v)

// ponytail: cycling palette, plenty for a categorias donut
const CORES = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#2563eb', '#db2777', '#65a30d']

const CATS_SUGERIDAS = ['Funcionário', 'Aluguel', 'Combustível', 'Marketing', 'ADS', 'Impostos', 'Manutenção', 'Outros']

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}
function periodoMes() {
  const h = new Date()
  const inicio = new Date(h.getFullYear(), h.getMonth(), 1)
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0)
  return { inicio: formatDate(inicio), fim: formatDate(fim), label: 'Mês' }
}
function periodoSemana() {
  const fim = new Date()
  const inicio = new Date()
  inicio.setDate(fim.getDate() - 6)
  return { inicio: formatDate(inicio), fim: formatDate(fim), label: 'Semana' }
}

const FORM_VAZIO = { descricao: '', categoria: '', valor: '', data: formatDate(new Date()), fixa: false, notas: '' }

function NovaDespesaModal({
  de, ate, mes, editando, onCloseEdicao,
}: { de: string; ate: string; mes: string; editando: Despesa | null; onCloseEdicao: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const isEditando = !!editando

  useEffect(() => {
    if (editando) {
      setForm({
        descricao: editando.descricao,
        categoria: editando.categoria,
        valor: String(editando.valor),
        data: editando.data,
        fixa: editando.fixa,
        notas: editando.notas ?? '',
      })
    }
  }, [editando])

  const { data: cats = [] } = useQuery<string[]>({
    queryKey: ['despesas-categorias'],
    queryFn: async () => (await api.get('/despesas/categorias')).data,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despesas-resumo', de, ate] })
    qc.invalidateQueries({ queryKey: ['despesas-list', de, ate] })
    qc.invalidateQueries({ queryKey: ['despesas-categorias'] })
  }

  function fechar() {
    setOpen(false)
    onCloseEdicao()
    setForm(FORM_VAZIO)
  }

  const criar = useMutation({
    mutationFn: async () =>
      (await api.post('/despesas', {
        descricao: form.descricao,
        categoria: form.categoria,
        valor: Number(form.valor),
        data: form.data,
        fixa: form.fixa,
        notas: form.notas || undefined,
      })).data,
    onSuccess: () => { invalidate(); fechar() },
  })

  const atualizar = useMutation({
    mutationFn: async () =>
      (await api.patch(`/despesas/${editando!.id}`, {
        descricao: form.descricao,
        categoria: form.categoria,
        valor: Number(form.valor),
        data: form.data,
        fixa: form.fixa,
        notas: form.notas || undefined,
      })).data,
    onSuccess: () => { invalidate(); fechar() },
  })

  const salvando = criar.isPending || atualizar.isPending
  const erroSalvar = criar.isError || atualizar.isError

  const copiarFixas = useMutation({
    mutationFn: async () => (await api.post('/despesas/copiar-fixas', { mes })).data,
    onSuccess: invalidate,
  })

  const datalistOptions = [...new Set([...CATS_SUGERIDAS, ...cats])]

  return (
    <div className="flex flex-wrap gap-2">
      <datalist id="cats-datalist">
        {datalistOptions.map((c) => <option key={c} value={c} />)}
      </datalist>
      <Button size="sm" onClick={() => setOpen(true)}>Nova despesa</Button>
      <Button size="sm" variant="outline" disabled={copiarFixas.isPending} onClick={() => copiarFixas.mutate()}>
        Copiar fixas do mês anterior
      </Button>

      <Dialog open={open || isEditando} onOpenChange={(o) => { if (!o) fechar() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditando ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); isEditando ? atualizar.mutate() : criar.mutate() }}
          >
            <div>
              <label className="text-xs font-medium text-gray-500">Descrição</label>
              <input required value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Categoria</label>
              <input required list="cats-datalist" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500">Valor</label>
                <input required type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500">Data</label>
                <input required type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.fixa} onChange={(e) => setForm((f) => ({ ...f, fixa: e.target.checked }))} />
              Despesa fixa (mensal)
            </label>
            <div>
              <label className="text-xs font-medium text-gray-500">Notas</label>
              <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" rows={2} />
            </div>
            {erroSalvar && <p className="text-xs text-red-500">Erro ao salvar. Verifique os campos.</p>}
            <DialogFooter>
              <Button type="submit" disabled={salvando}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FinanceiroAgro() {
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState(periodoMes())
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Despesa | null>(null)
  const { inicio, fim } = periodo
  const mes = inicio.slice(0, 7)

  const { data: fin } = useQuery<AgroFin>({
    queryKey: ['financeiro-agro', inicio, fim],
    queryFn: async () => (await api.get('/financeiro/agro', { params: { inicio, fim } })).data,
  })
  const { data: resumo } = useQuery<DespesasResumo>({
    queryKey: ['despesas-resumo', inicio, fim],
    queryFn: async () => (await api.get('/despesas/resumo', { params: { de: inicio, ate: fim } })).data,
  })
  const { data: despesas = [] } = useQuery<Despesa[]>({
    queryKey: ['despesas-list', inicio, fim],
    queryFn: async () => (await api.get('/despesas', { params: { de: inicio, ate: fim } })).data,
  })

  const { mutate: removerDespesa } = useMutation({
    mutationFn: (id: string) => api.delete(`/despesas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas-resumo', inicio, fim] })
      qc.invalidateQueries({ queryKey: ['despesas-list', inicio, fim] })
      qc.invalidateQueries({ queryKey: ['despesas-categorias'] })
    },
  })

  function excluirDespesa(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}" (${fmt(Number(d.valor))})?`)) return
    removerDespesa(d.id)
  }

  const receitas = fin?.totalReceitas ?? 0
  const totalDespesas = resumo?.total ?? 0
  const resultado = receitas - totalDespesas

  const despesasFiltradas = useMemo(
    () => catFiltro ? despesas.filter((d) => d.categoria === catFiltro) : despesas,
    [despesas, catFiltro]
  )

  const botoes = [
    { label: 'Semana', fn: periodoSemana },
    { label: 'Mês', fn: periodoMes },
  ]

  const cards = [
    { title: 'Receitas', value: fmt(receitas), cls: 'text-gray-900' },
    { title: 'Despesas', value: fmt(totalDespesas), cls: 'text-gray-900' },
    { title: 'Resultado', value: fmt(resultado), cls: resultado >= 0 ? 'text-emerald-600' : 'text-red-500' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">Financeiro</h1>
        <div className="flex flex-wrap items-center gap-2">
          {botoes.map((b) => (
            <button key={b.label} onClick={() => setPeriodo(b.fn())}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodo.label === b.label ? 'bg-violet-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {b.label}
            </button>
          ))}
          <input type="date" value={inicio}
            onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value, label: '' }))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700" />
          <span className="text-sm text-gray-400">até</span>
          <input type="date" value={fim}
            onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value, label: '' }))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700" />
        </div>
      </div>

      {/* Resumo cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-xs font-medium text-gray-400 uppercase tracking-wide">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <p className={`text-2xl font-bold ${card.cls}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Despesas */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-gray-800">Despesas</CardTitle>
            <NovaDespesaModal de={inicio} ate={fim} mes={mes} editando={editando} onCloseEdicao={() => setEditando(null)} />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="min-w-0">
              {(resumo?.categorias.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={260} minWidth={0}>
                  <PieChart>
                    <Pie data={resumo!.categorias} dataKey="total" nameKey="categoria"
                      cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}
                      isAnimationActive={false}
                      onClick={(_, i) => {
                        const cat = resumo!.categorias[i]?.categoria
                        if (cat) setCatFiltro((c) => c === cat ? null : cat)
                      }}>
                      {resumo!.categorias.map((c, i) => (
                        <Cell key={c.categoria} fill={CORES[i % CORES.length]} cursor="pointer"
                          opacity={catFiltro && catFiltro !== c.categoria ? 0.35 : 1} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmt(Number(v)), String(n)]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
                  Nenhuma despesa no período
                </div>
              )}
              {catFiltro && (
                <button onClick={() => setCatFiltro(null)} className="mt-1 text-xs text-violet-600 hover:underline">
                  Limpar filtro: {catFiltro}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Data</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Descrição</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Categoria</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Valor</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Fixa</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {despesasFiltradas.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-3 text-gray-400">Nenhuma despesa</td></tr>
                  ) : (
                    despesasFiltradas.map((d) => (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600">{d.data}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{d.descricao}</td>
                        <td className="px-3 py-2 text-gray-600">{d.categoria}</td>
                        <td className="px-3 py-2 text-gray-600">{fmt(Number(d.valor))}</td>
                        <td className="px-3 py-2 text-gray-600">{d.fixa ? 'Sim' : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditando(d)} className="text-gray-400 hover:text-gray-700">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => excluirDespesa(d)} className="text-gray-400 hover:text-red-500">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receitas */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-800">Receitas (fechamentos)</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Data</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Cliente</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Produto</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-400 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(fin?.fechamentos.length ?? 0) === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-3 text-gray-400">Nenhum fechamento no período</td></tr>
                ) : (
                  fin!.fechamentos.map((f) => (
                    <tr key={f.id} className="border-b border-gray-50">
                      <td className="px-3 py-2 text-gray-600">{f.data_fechamento}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{f.nome}</td>
                      <td className="px-3 py-2 text-gray-600">{f.produto ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{fmt(f.valor_fechado)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
