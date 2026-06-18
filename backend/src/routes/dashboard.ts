import { Router } from 'express'
import { supabase } from '../db/supabase'

const router = Router()

router.get('/metricas', async (_req, res) => {
  const now = new Date()
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
  const inicioMesAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const fimMesAnt = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

  const [
    { count: totalAgendamentos },
    { count: totalAgendamentosAnt },
    { count: leadsNovos },
    { count: leadsNovosAnt },
    { data: agendamentosConc },
    { data: agendamentosConcAnt },
    { count: totalPacientes },
    { count: clientesTotal },
  ] = await Promise.all([
    supabase.from('agendamentos').select('*', { count: 'exact', head: true })
      .gte('data_hora', inicioMes).lte('data_hora', fimMes),
    supabase.from('agendamentos').select('*', { count: 'exact', head: true })
      .gte('data_hora', inicioMesAnt).lte('data_hora', fimMesAnt),
    supabase.from('pacientes').select('*', { count: 'exact', head: true })
      .gte('created_at', inicioMes).eq('status', 'novo'),
    supabase.from('pacientes').select('*', { count: 'exact', head: true })
      .gte('created_at', inicioMesAnt).lte('created_at', fimMesAnt).eq('status', 'novo'),
    supabase.from('agendamentos').select('servico_id, servicos(preco)').eq('status', 'concluido')
      .gte('data_hora', inicioMes).lte('data_hora', fimMes),
    supabase.from('agendamentos').select('servico_id, servicos(preco)').eq('status', 'concluido')
      .gte('data_hora', inicioMesAnt).lte('data_hora', fimMesAnt),
    supabase.from('pacientes').select('*', { count: 'exact', head: true }),
    supabase.from('pacientes').select('*', { count: 'exact', head: true }).eq('status', 'cliente'),
  ])

  const fat = (agendamentosConc ?? []).reduce((acc: number, a: { servicos: { preco: number } | null }) => acc + (a.servicos?.preco ?? 0), 0)
  const fatAnt = (agendamentosConcAnt ?? []).reduce((acc: number, a: { servicos: { preco: number } | null }) => acc + (a.servicos?.preco ?? 0), 0)

  const delta = (atual: number, ant: number) =>
    ant === 0 ? null : Math.round(((atual - ant) / ant) * 100)

  const taxaConversao = totalPacientes && totalPacientes > 0
    ? Math.round(((clientesTotal ?? 0) / totalPacientes) * 100)
    : 0

  res.json({
    faturamentoMes: fat,
    agendamentosMes: totalAgendamentos ?? 0,
    leadsNovos: leadsNovos ?? 0,
    taxaConversao,
    deltas: {
      faturamento: delta(fat, fatAnt),
      agendamentos: delta(totalAgendamentos ?? 0, totalAgendamentosAnt ?? 0),
      leads: delta(leadsNovos ?? 0, leadsNovosAnt ?? 0),
    },
  })
})

router.get('/grafico', async (_req, res) => {
  const hoje = new Date()
  const inicio = new Date(hoje)
  inicio.setDate(hoje.getDate() - 29)
  inicio.setHours(0, 0, 0, 0)

  const { data: agendamentos } = await supabase
    .from('agendamentos').select('data_hora').gte('data_hora', inicio.toISOString()).neq('status', 'cancelado')

  const { data: conversas } = await supabase
    .from('conversas').select('created_at').gte('created_at', inicio.toISOString()).not('mensagem_paciente', 'is', null)

  const dias: Record<string, { data: string; agendamentos: number; mensagens: number }> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dias[key] = { data: key, agendamentos: 0, mensagens: 0 }
  }
  for (const ag of agendamentos ?? []) {
    const key = ag.data_hora.slice(0, 10)
    if (dias[key]) dias[key].agendamentos++
  }
  for (const c of conversas ?? []) {
    const key = c.created_at.slice(0, 10)
    if (dias[key]) dias[key].mensagens++
  }

  res.json(Object.values(dias))
})

router.get('/status-pacientes', async (_req, res) => {
  const { data } = await supabase.from('pacientes').select('status')

  const counts: Record<string, number> = {}
  for (const p of data ?? []) {
    counts[p.status] = (counts[p.status] ?? 0) + 1
  }

  const labels: Record<string, string> = {
    novo: 'Novo',
    em_conversa: 'Em conversa',
    consulta_agendada: 'Agendado',
    cliente: 'Cliente',
    frio: 'Frio',
  }
  const colors: Record<string, string> = {
    novo: '#7c3aed',
    em_conversa: '#0891b2',
    consulta_agendada: '#16a34a',
    cliente: '#d97706',
    frio: '#9ca3af',
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const resultado = Object.entries(counts).map(([status, count]) => ({
    status,
    nome: labels[status] ?? status,
    count,
    percentual: total > 0 ? Math.round((count / total) * 100) : 0,
    cor: colors[status] ?? '#aaa',
  })).sort((a, b) => b.count - a.count)

  res.json({ total, itens: resultado })
})

router.get('/agendamentos-semana', async (_req, res) => {
  const { data } = await supabase
    .from('agendamentos')
    .select('data_hora')
    .neq('status', 'cancelado')

  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const counts = [0, 0, 0, 0, 0, 0, 0]

  for (const ag of data ?? []) {
    const d = new Date(ag.data_hora)
    counts[d.getDay()]++
  }

  res.json(dias.map((dia, i) => ({ dia, agendamentos: counts[i] })))
})

export default router
