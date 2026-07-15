import { Router, Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { agoraComoTextoLocal, comoTextoLocal } from '../lib/datetime-local'

const router = Router()

export function requireAdminOuSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.role
  if (role === 'secretaria' || role === 'vendedor') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  next()
}

interface Periodo {
  local: { inicio: string; fim: string }
  utc: { inicio: string; fim: string }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function construirPeriodo(ini: Date, fim: Date): Periodo {
  return {
    local: { inicio: comoTextoLocal(ini), fim: comoTextoLocal(fim) },
    utc: { inicio: ini.toISOString(), fim: fim.toISOString() },
  }
}

function parsePeriodo(inicioParam?: string, fimParam?: string): { atual: Periodo; anterior: Periodo } {
  let inicioDate: Date
  let fimDate: Date

  if (inicioParam && fimParam) {
    inicioDate = new Date(`${inicioParam}T00:00:00-03:00`)
    fimDate = new Date(`${fimParam}T23:59:59-03:00`)
  } else {
    const [anoStr, mesStr] = agoraComoTextoLocal().split('-')
    const ano = parseInt(anoStr, 10)
    const mes = parseInt(mesStr, 10)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    inicioDate = new Date(`${ano}-${pad2(mes)}-01T00:00:00-03:00`)
    fimDate = new Date(`${ano}-${pad2(mes)}-${pad2(ultimoDia)}T23:59:59-03:00`)
  }

  const lengthMs = fimDate.getTime() - inicioDate.getTime()
  const antInicioDate = new Date(inicioDate.getTime() - lengthMs)
  const antFimDate = new Date(fimDate.getTime() - lengthMs)

  return {
    atual: construirPeriodo(inicioDate, fimDate),
    anterior: construirPeriodo(antInicioDate, antFimDate),
  }
}

function delta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

interface AgendamentoComServico {
  id: string
  servico_id: string
  profissional_id: string
  paciente_id: string
  servicos: { preco: number } | null
  profissionais: { nome: string; comissao_percentual: number } | null
}

function somaPreco(rows: AgendamentoComServico[] | null) {
  return (rows ?? []).reduce((acc, ag) => acc + (ag.servicos?.preco ?? 0), 0)
}

function contar(rows: AgendamentoComServico[] | null) {
  return (rows ?? []).length
}

router.use(requireAdminOuSuperAdmin)

router.get('/resumo', async (req, res) => {
  const tenantId = req.user!.tenant_id
  if (!tenantId) {
    return res.json({
      faturamento: 0,
      ticketMedio: 0,
      agendamentosConcluidos: 0,
      agendamentosCancelados: 0,
      taxaCancelamento: 0,
      clientesNovos: 0,
      clientesRecorrentes: 0,
      deltas: { faturamento: null, ticketMedio: null, agendamentosConcluidos: null },
    })
  }

  const { atual, anterior } = parsePeriodo(req.query.inicio as string | undefined, req.query.fim as string | undefined)

  const [
    { data: concluidosAtual },
    { data: concluidosAnt },
    { count: canceladosAtual },
    { count: canceladosAnt },
    { count: clientesNovosAtual },
    { count: clientesNovosAnt },
  ] = await Promise.all([
    supabaseAdmin
      .from('agendamentos')
      .select('servico_id, paciente_id, servicos(preco)')
      .eq('tenant_id', tenantId)
      .eq('status', 'concluido')
      .gte('data_hora', atual.local.inicio)
      .lte('data_hora', atual.local.fim),
    supabaseAdmin
      .from('agendamentos')
      .select('servico_id, paciente_id, servicos(preco)')
      .eq('tenant_id', tenantId)
      .eq('status', 'concluido')
      .gte('data_hora', anterior.local.inicio)
      .lte('data_hora', anterior.local.fim),
    supabaseAdmin
      .from('agendamentos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'cancelado')
      .gte('data_hora', atual.local.inicio)
      .lte('data_hora', atual.local.fim),
    supabaseAdmin
      .from('agendamentos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'cancelado')
      .gte('data_hora', anterior.local.inicio)
      .lte('data_hora', anterior.local.fim),
    supabaseAdmin
      .from('pacientes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', atual.utc.inicio)
      .lte('created_at', atual.utc.fim),
    supabaseAdmin
      .from('pacientes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', anterior.utc.inicio)
      .lte('created_at', anterior.utc.fim),
  ])

  const faturamento = somaPreco(concluidosAtual as unknown as AgendamentoComServico[] | null)
  const faturamentoAnt = somaPreco(concluidosAnt as unknown as AgendamentoComServico[] | null)
  const agendamentosConcluidos = contar(concluidosAtual as unknown as AgendamentoComServico[] | null)
  const agendamentosConcluidosAnt = contar(concluidosAnt as unknown as AgendamentoComServico[] | null)

  const concluidosCount = agendamentosConcluidos
  const canceladosCount = canceladosAtual ?? 0
  const taxaCancelamento = concluidosCount + canceladosCount === 0
    ? 0
    : Math.round((canceladosCount / (concluidosCount + canceladosCount)) * 100)

  // Clientes recorrentes: criados antes do início do período e com ao menos 1 agendamento concluído dentro do período.
  let clientesRecorrentes = 0
  if ((concluidosAtual ?? []).length > 0) {
    const pacienteIds = [...new Set((concluidosAtual as unknown as AgendamentoComServico[]).map((a) => a.paciente_id))]
    const { count } = await supabaseAdmin
      .from('pacientes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .lt('created_at', atual.utc.inicio)
      .in('id', pacienteIds)
    clientesRecorrentes = count ?? 0
  }

  res.json({
    faturamento,
    ticketMedio: concluidosCount > 0 ? faturamento / concluidosCount : 0,
    agendamentosConcluidos: concluidosCount,
    agendamentosCancelados: canceladosCount,
    taxaCancelamento,
    clientesNovos: clientesNovosAtual ?? 0,
    clientesRecorrentes,
    deltas: {
      faturamento: delta(faturamento, faturamentoAnt),
      ticketMedio: delta(concluidosCount > 0 ? faturamento / concluidosCount : 0, agendamentosConcluidosAnt > 0 ? faturamentoAnt / agendamentosConcluidosAnt : 0),
      agendamentosConcluidos: delta(concluidosCount, agendamentosConcluidosAnt),
    },
  })
})

router.get('/por-procedimento', async (req, res) => {
  const tenantId = req.user!.tenant_id
  if (!tenantId) return res.json([])

  const { atual } = parsePeriodo(req.query.inicio as string | undefined, req.query.fim as string | undefined)

  const { data } = await supabaseAdmin
    .from('agendamentos')
    .select('servico_id, servicos(id, nome, preco)')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluido')
    .gte('data_hora', atual.local.inicio)
    .lte('data_hora', atual.local.fim)

  type Row = { servico_id: string; servicos: { id: string; nome: string; preco: number } | null }

  const map = new Map<string, { servico_id: string; nome: string; quantidade: number; receita: number }>()
  for (const row of (data ?? []) as unknown as Row[]) {
    const id = row.servico_id
    const nome = row.servicos?.nome ?? '—'
    const preco = row.servicos?.preco ?? 0
    const atual = map.get(id) ?? { servico_id: id, nome, quantidade: 0, receita: 0 }
    atual.quantidade++
    atual.receita += preco
    map.set(id, atual)
  }

  res.json([...map.values()].sort((a, b) => b.receita - a.receita))
})

router.get('/por-profissional', async (req, res) => {
  const tenantId = req.user!.tenant_id
  if (!tenantId) return res.json([])

  const { atual } = parsePeriodo(req.query.inicio as string | undefined, req.query.fim as string | undefined)

  const { data } = await supabaseAdmin
    .from('agendamentos')
    .select('profissional_id, servicos(preco), profissionais(nome, comissao_percentual)')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluido')
    .gte('data_hora', atual.local.inicio)
    .lte('data_hora', atual.local.fim)

  type Row = {
    profissional_id: string
    servicos: { preco: number } | null
    profissionais: { nome: string; comissao_percentual: number } | null
  }

  const map = new Map<string, { profissional_id: string; nome: string; atendimentos: number; receita: number; comissao_percentual: number; comissao_estimada: number }>()
  for (const row of (data ?? []) as unknown as Row[]) {
    const id = row.profissional_id
    const nome = row.profissionais?.nome ?? '—'
    const comissao = row.profissionais?.comissao_percentual ?? 0
    const preco = row.servicos?.preco ?? 0
    const atual = map.get(id) ?? { profissional_id: id, nome, atendimentos: 0, receita: 0, comissao_percentual: comissao, comissao_estimada: 0 }
    atual.atendimentos++
    atual.receita += preco
    atual.comissao_estimada = atual.receita * (atual.comissao_percentual / 100)
    map.set(id, atual)
  }

  res.json([...map.values()].sort((a, b) => b.receita - a.receita))
})

router.get('/agro', requireAdminOuSuperAdmin, async (req: Request, res: Response) => {
  const inicio = (req.query.inicio as string) || agoraComoTextoLocal().slice(0, 8) + '01'
  const fim = (req.query.fim as string) || agoraComoTextoLocal().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('pacientes')
    .select('id, nome, telefone, valor_fechado, data_fechamento, produto_interesse_id, produtos:produto_interesse_id(nome)')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('status', 'fechado')
    .gte('data_fechamento', inicio)
    .lte('data_fechamento', fim)
    .order('data_fechamento', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const fechamentos = (data ?? []).map((p) => ({
    id: p.id,
    nome: p.nome ?? p.telefone,
    valor_fechado: Number(p.valor_fechado ?? 0),
    data_fechamento: p.data_fechamento,
    produto: (p.produtos as unknown as { nome: string } | null)?.nome ?? null,
  }))

  res.json({
    totalReceitas: fechamentos.reduce((s, f) => s + f.valor_fechado, 0),
    fechamentos,
  })
})

export default router
