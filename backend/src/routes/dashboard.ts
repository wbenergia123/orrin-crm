import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { agoraComoTextoLocal, somarMinutosTextoLocal } from '../lib/datetime-local'
import { getVerticalDoTenant } from '../lib/vertical'

const router = Router()

const emptyMetrics = {
  faturamentoMes: 0,
  agendamentosMes: 0,
  leadsNovos: 0,
  taxaConversao: 0,
  deltas: { faturamento: null, agendamentos: null, leads: null },
}

// Limites do mês (atual e anterior) calculados no calendário de Brasília — tanto em
// texto local puro (pra comparar com data_hora) quanto em ISO/UTC real (pra
// comparar com colunas como created_at, que são populadas via NOW() e por isso
// guardam o valor já em UTC).
function limitesDoMes() {
  const [anoStr, mesStr] = agoraComoTextoLocal().split('-')
  const ano = parseInt(anoStr, 10)
  const mes = parseInt(mesStr, 10) // 1-12
  const pad = (n: number) => String(n).padStart(2, '0')

  const mesAnt = mes === 1 ? 12 : mes - 1
  const anoAnt = mes === 1 ? ano - 1 : ano
  const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate()

  const local = {
    inicioMes: `${ano}-${pad(mes)}-01T00:00:00`,
    fimMes: `${ano}-${pad(mes)}-${pad(ultimoDia(ano, mes))}T23:59:59`,
    inicioMesAnt: `${anoAnt}-${pad(mesAnt)}-01T00:00:00`,
    fimMesAnt: `${anoAnt}-${pad(mesAnt)}-${pad(ultimoDia(anoAnt, mesAnt))}T23:59:59`,
  }
  const utc = Object.fromEntries(
    Object.entries(local).map(([k, v]) => [k, new Date(`${v}-03:00`).toISOString()])
  ) as Record<keyof typeof local, string>

  return { local, utc }
}

async function metricasAgro(req: Request, res: Response) {
  const tenant = req.user!.tenant_id!
  const agora = agoraComoTextoLocal()

  // Mês alvo (YYYY-MM via ?mes=) ou o mês atual
  const mesParam = typeof req.query.mes === 'string' && /^\d{4}-\d{2}$/.test(req.query.mes)
    ? req.query.mes
    : agora.slice(0, 7)
  const [anoAlvo, mesAlvo] = mesParam.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate()
  const janela = (a: number, m: number) => {
    const ini = `${a}-${pad(m)}-01`
    const fim = `${a}-${pad(m)}-${pad(ultimoDia(a, m))}`
    return {
      localIni: ini, localFim: fim,
      utcIni: new Date(`${ini}T00:00:00-03:00`).toISOString(),
      utcFim: new Date(`${fim}T23:59:59-03:00`).toISOString(),
    }
  }
  const alvo = janela(anoAlvo, mesAlvo)
  const ant = janela(mesAlvo === 1 ? anoAlvo - 1 : anoAlvo, mesAlvo === 1 ? 12 : mesAlvo - 1)

  const ABERTOS = ['reuniao_agendada', 'orcamento_enviado', 'negociacao']

  const [todosPacientes, leadsMes, leadsMesAnt, reunMes, reunMesAnt, fechadosMes, fechadosMesAnt, proximas] =
    await Promise.all([
      supabaseAdmin.from('pacientes').select('status, valor_estimado').eq('tenant_id', tenant),
      supabaseAdmin.from('pacientes').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant).gte('created_at', alvo.utcIni).lte('created_at', alvo.utcFim),
      supabaseAdmin.from('pacientes').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant).gte('created_at', ant.utcIni).lte('created_at', ant.utcFim),
      supabaseAdmin.from('reunioes_agro').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).neq('status', 'cancelada')
        .gte('data_hora', `${alvo.localIni}T00:00:00`).lte('data_hora', `${alvo.localFim}T23:59:59`),
      supabaseAdmin.from('reunioes_agro').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).neq('status', 'cancelada')
        .gte('data_hora', `${ant.localIni}T00:00:00`).lte('data_hora', `${ant.localFim}T23:59:59`),
      supabaseAdmin.from('pacientes').select('id, valor_fechado').eq('tenant_id', tenant).eq('status', 'fechado')
        .gte('data_fechamento', alvo.localIni).lte('data_fechamento', alvo.localFim),
      supabaseAdmin.from('pacientes').select('valor_fechado').eq('tenant_id', tenant).eq('status', 'fechado')
        .gte('data_fechamento', ant.localIni).lte('data_fechamento', ant.localFim),
      supabaseAdmin.from('reunioes_agro')
        .select('id, data_hora, tipo, pacientes(nome, telefone), profissionais(nome)')
        .eq('tenant_id', tenant).in('status', ['agendada', 'confirmada'])
        .gte('data_hora', agora).order('data_hora', { ascending: true }).limit(5),
    ])

  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

  // Funil + valor em negociação (snapshot atual do pipeline)
  const ETAPAS = [
    { status: 'novo', nome: 'Novo' },
    { status: 'em_conversa', nome: 'Em conversa' },
    { status: 'reuniao_agendada', nome: 'Reunião marcada' },
    { status: 'orcamento_enviado', nome: 'Orçamento enviado' },
    { status: 'negociacao', nome: 'Negociação' },
    { status: 'fechado', nome: 'Fechado' },
  ]
  const pacientes = todosPacientes.data ?? []
  const funil = ETAPAS.map((e) => ({ nome: e.nome, qtd: pacientes.filter((p) => p.status === e.status).length }))
  const valorEmNegociacao = pacientes
    .filter((p) => ABERTOS.includes(p.status))
    .reduce((s, p) => s + Number(p.valor_estimado ?? 0), 0)

  const valorFechadoMes = (fechadosMes.data ?? []).reduce((s, p) => s + Number(p.valor_fechado ?? 0), 0)
  const valorFechadoMesAnt = (fechadosMesAnt.data ?? []).reduce((s, p) => s + Number(p.valor_fechado ?? 0), 0)
  const negociosFechadosMes = (fechadosMes.data ?? []).length

  // Ranking: atribui cada negócio fechado ao vendedor da reunião mais recente do cliente
  const idsFechados = (fechadosMes.data ?? []).map((p) => p.id)
  let ranking: { nome: string; valor: number; negocios: number }[] = []
  if (idsFechados.length > 0) {
    const { data: reunioesFechados } = await supabaseAdmin
      .from('reunioes_agro').select('paciente_id, profissionais(nome)')
      .eq('tenant_id', tenant).in('paciente_id', idsFechados)
      .order('data_hora', { ascending: false })
    const vendedorDoPaciente = new Map<string, string>()
    for (const r of reunioesFechados ?? []) {
      const nome = (r.profissionais as unknown as { nome: string } | null)?.nome
      if (nome && !vendedorDoPaciente.has(r.paciente_id)) vendedorDoPaciente.set(r.paciente_id, nome)
    }
    const porVendedor = new Map<string, { valor: number; negocios: number }>()
    for (const p of fechadosMes.data ?? []) {
      const nome = vendedorDoPaciente.get(p.id) ?? 'Sem vendedor'
      const cur = porVendedor.get(nome) ?? { valor: 0, negocios: 0 }
      cur.valor += Number(p.valor_fechado ?? 0)
      cur.negocios += 1
      porVendedor.set(nome, cur)
    }
    ranking = [...porVendedor.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor)
  }

  const proximasReunioes = (proximas.data ?? []).map((r) => {
    const pac = r.pacientes as unknown as { nome: string | null; telefone: string } | null
    return {
      id: r.id,
      data_hora: r.data_hora,
      tipo: r.tipo,
      cliente: pac?.nome ?? pac?.telefone ?? 'Cliente',
      vendedor: (r.profissionais as unknown as { nome: string } | null)?.nome ?? null,
    }
  })

  res.json({
    vertical: 'agro',
    mes: mesParam,
    leadsNovosMes: leadsMes.count ?? 0,
    reunioesMes: reunMes.count ?? 0,
    negociosFechadosMes,
    valorFechadoMes,
    valorEmNegociacao,
    deltas: {
      leads: delta(leadsMes.count ?? 0, leadsMesAnt.count ?? 0),
      reunioes: delta(reunMes.count ?? 0, reunMesAnt.count ?? 0),
      negocios: delta(negociosFechadosMes, (fechadosMesAnt.data ?? []).length),
      valorFechado: delta(valorFechadoMes, valorFechadoMesAnt),
    },
    funil,
    proximasReunioes,
    ranking,
  })
}

router.get('/metricas', async (req, res) => {
  if (!req.user!.tenant_id) { res.json(emptyMetrics); return }

  const vertical = await getVerticalDoTenant(req.user!.tenant_id)
  if (vertical === 'agro') return metricasAgro(req, res)

  const { local, utc } = limitesDoMes()
  const { inicioMes, fimMes, inicioMesAnt, fimMesAnt } = local

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
    supabaseAdmin.from('agendamentos').select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.user!.tenant_id)
      .gte('data_hora', inicioMes).lte('data_hora', fimMes),
    supabaseAdmin.from('agendamentos').select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.user!.tenant_id)
      .gte('data_hora', inicioMesAnt).lte('data_hora', fimMesAnt),
    supabaseAdmin.from('pacientes').select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.user!.tenant_id)
      .gte('created_at', utc.inicioMes).eq('status', 'novo'),
    supabaseAdmin.from('pacientes').select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.user!.tenant_id)
      .gte('created_at', utc.inicioMesAnt).lte('created_at', utc.fimMesAnt).eq('status', 'novo'),
    supabaseAdmin.from('agendamentos').select('servico_id, servicos(preco)').eq('status', 'concluido')
      .eq('tenant_id', req.user!.tenant_id)
      .gte('data_hora', inicioMes).lte('data_hora', fimMes),
    supabaseAdmin.from('agendamentos').select('servico_id, servicos(preco)').eq('status', 'concluido')
      .eq('tenant_id', req.user!.tenant_id)
      .gte('data_hora', inicioMesAnt).lte('data_hora', fimMesAnt),
    supabaseAdmin.from('pacientes').select('*', { count: 'exact', head: true }).eq('tenant_id', req.user!.tenant_id),
    supabaseAdmin.from('pacientes').select('*', { count: 'exact', head: true }).eq('tenant_id', req.user!.tenant_id).eq('status', 'cliente'),
  ])

  type FaturamentoRow = { servicos: { preco: number } | null }

  const somaPreco = (rows: FaturamentoRow[] | null) =>
    (rows ?? []).reduce((acc, a) => acc + (a.servicos?.preco ?? 0), 0)

  const fat = somaPreco(agendamentosConc as FaturamentoRow[] | null)
  const fatAnt = somaPreco(agendamentosConcAnt as FaturamentoRow[] | null)

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

router.get('/grafico', async (req, res) => {
  if (!req.user!.tenant_id) { res.json([]); return }

  const hoje = new Date()
  const inicio = new Date(hoje)
  inicio.setDate(hoje.getDate() - 29)
  inicio.setHours(0, 0, 0, 0)

  // data_hora é texto local (sem timezone) — usa um limite no calendário de
  // Brasília, não o "inicio" em UTC usado pra created_at.
  const hojeMeiaNoiteLocal = `${agoraComoTextoLocal().substring(0, 10)}T00:00:00`
  const inicioDataHora = somarMinutosTextoLocal(hojeMeiaNoiteLocal, -29 * 24 * 60)

  const { data: agendamentos } = await supabaseAdmin
    .from('agendamentos').select('data_hora')
    .eq('tenant_id', req.user!.tenant_id)
    .gte('data_hora', inicioDataHora).neq('status', 'cancelado')

  const { data: conversas } = await supabaseAdmin
    .from('conversas_pacientes').select('created_at')
    .eq('tenant_id', req.user!.tenant_id)
    .gte('created_at', inicio.toISOString()).not('mensagem_paciente', 'is', null)

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

router.get('/status-pacientes', async (req, res) => {
  if (!req.user!.tenant_id) { res.json({ total: 0, itens: [] }); return }

  const { data } = await supabaseAdmin
    .from('pacientes')
    .select('status')
    .eq('tenant_id', req.user!.tenant_id)

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

router.get('/agendamentos-semana', async (req, res) => {
  if (!req.user!.tenant_id) { res.json(['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((dia) => ({ dia, agendamentos: 0 }))); return }

  const { data } = await supabaseAdmin
    .from('agendamentos')
    .select('data_hora')
    .eq('tenant_id', req.user!.tenant_id)
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
