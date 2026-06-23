import { supabase } from '../db/supabase'
import { enviarMensagemViaUAZAPI } from './uazapi-client'
import type { FollowupRegra } from '../types'

const PADRAO_TIMEZONE = 'America/Sao_Paulo'
const COOLDOWN_MINUTOS = 4 * 60

interface TenantConfig {
  ativo: boolean
  timezone: string
  inicio: string
  fim: string
}

async function loadTenantConfig(tenantId: string): Promise<TenantConfig> {
  const { data: rows } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .eq('tenant_id', tenantId)
    .in('chave', ['followup_ativo', 'followup_timezone', 'followup_horario_comercial_inicio', 'followup_horario_comercial_fim'])

  const map = Object.fromEntries((rows ?? []).map((r) => [r.chave, r.valor]))

  return {
    ativo: map['followup_ativo'] !== 'false',
    timezone: map['followup_timezone'] || PADRAO_TIMEZONE,
    inicio: map['followup_horario_comercial_inicio'] || '08:00',
    fim: map['followup_horario_comercial_fim'] || '20:00',
  }
}

function isBusinessHour(now: Date, timezone: string, inicio: string, fim: string): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  const current = `${hour}:${minute}`
  return current >= inicio && current < fim
}

async function loadActiveRules(tenantId: string): Promise<FollowupRegra[]> {
  const { data, error } = await supabase
    .from('followup_regras')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('ordem_prioridade', { ascending: false })

  if (error) {
    console.error('[followup] Erro ao carregar regras:', error.message)
    return []
  }

  return (data ?? []) as FollowupRegra[]
}

function formatDateTime(dateStr: string, timezone: string) {
  const date = new Date(dateStr)
  return {
    data: new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: '2-digit' }).format(date),
    hora: new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
  }
}

function applyTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\[(\w+)\]/g, (_, key) => vars[key] ?? '')
}

async function jaEnviou(regraId: string, pacienteId: string, agendamentoId: string | null, desde: Date) {
  let query = supabase
    .from('followup_envios')
    .select('id')
    .eq('regra_id', regraId)
    .eq('paciente_id', pacienteId)
    .gte('enviado_em', desde.toISOString())

  if (agendamentoId) query = query.eq('agendamento_id', agendamentoId)
  else query = query.is('agendamento_id', null)

  const { data } = await query
  return (data ?? []).length > 0
}

async function pacienteEmCooldown(tenantId: string, pacienteId: string, agora: Date) {
  const desde = new Date(agora.getTime() - COOLDOWN_MINUTOS * 60 * 1000)
  const { data } = await supabase
    .from('followup_envios')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('paciente_id', pacienteId)
    .gte('enviado_em', desde.toISOString())

  return (data ?? []).length > 0
}

async function temAgendamentoFuturo(pacienteId: string, agora: Date) {
  const { data } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('paciente_id', pacienteId)
    .eq('status', 'confirmado')
    .gt('data_hora', agora.toISOString())
    .limit(1)

  return (data ?? []).length > 0
}

async function enviar(tenantId: string, regra: FollowupRegra, paciente: any, agendamento: any | null, vars: Record<string, string>, agora: Date) {
  const mensagem = applyTemplate(regra.template, vars)
  const enviado = await enviarMensagemViaUAZAPI({ phone: paciente.telefone, text: mensagem })

  if (!enviado) return

  await supabase.from('followup_envios').insert({
    tenant_id: tenantId,
    paciente_id: paciente.id,
    regra_id: regra.id,
    agendamento_id: agendamento?.id ?? null,
    mensagem,
    enviado_em: agora.toISOString(),
  })
}

async function processarNaoRespondeu(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const desdeEspera = new Date(agora.getTime() - (regra.delay_minutos! + 10) * 60 * 1000)
  const ateEspera = new Date(agora.getTime() - (regra.delay_minutos! - 10) * 60 * 1000)

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['novo', 'em_conversa'])
    .gte('ultimo_contato_at', desdeEspera.toISOString())
    .lte('ultimo_contato_at', ateEspera.toISOString())

  for (const paciente of pacientes ?? []) {
    if (await pacienteEmCooldown(tenantId, paciente.id, agora)) continue
    if (await temAgendamentoFuturo(paciente.id, agora)) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, null, desdeRegra)) continue

    await enviar(tenantId, regra, paciente, null, { nome: paciente.nome || 'tudo bem' }, agora)
  }
}

async function processarLembreteAgendamento(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const desde = new Date(agora.getTime() + (regra.delay_minutos! - 10) * 60 * 1000)
  const ate = new Date(agora.getTime() + (regra.delay_minutos! + 10) * 60 * 1000)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*), servico:servicos(*), profissional:profissionais(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', desde.toISOString())
    .lte('data_hora', ate.toISOString())

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    const servico = (ag as any).servico
    const profissional = (ag as any).profissional

    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    const { data, hora } = formatDateTime(ag.data_hora, config.timezone)
    await enviar(tenantId, regra, paciente, ag, {
      nome: paciente.nome || 'tudo bem',
      servico: servico?.nome || 'seu procedimento',
      profissional: profissional?.nome || 'nossa equipe',
      hora,
      data,
    }, agora)
  }
}

async function processarNoShow(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const desde = new Date(agora.getTime() - 60 * 60 * 1000)
  const ate = new Date(agora.getTime() - 15 * 60 * 1000)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', desde.toISOString())
    .lte('data_hora', ate.toISOString())

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    await enviar(tenantId, regra, paciente, ag, { nome: paciente.nome || 'tudo bem' }, agora)
  }
}

async function processarLembreteDia(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const horaAtual = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(agora)

  const horarioFixo = (regra.horario_fixo ?? '08:00').substring(0, 5)
  if (horaAtual < horarioFixo) return

  const hojeStr = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(agora)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*), servico:servicos(*), profissional:profissionais(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', `${hojeStr}T00:00:00-03:00`)
    .lte('data_hora', `${hojeStr}T23:59:59-03:00`)
    .gt('data_hora', agora.toISOString())

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    const servico = (ag as any).servico
    const profissional = (ag as any).profissional
    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    const { hora } = formatDateTime(ag.data_hora, config.timezone)
    await enviar(tenantId, regra, paciente, ag, {
      nome: paciente.nome || 'tudo bem',
      servico: servico?.nome || 'seu procedimento',
      profissional: profissional?.nome || 'nossa equipe',
      hora,
    }, agora)
  }
}

async function processarRegra(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  try {
    switch (regra.gatilho) {
      case 'nao_respondeu':
        await processarNaoRespondeu(tenantId, regra, agora, config)
        break
      case 'lembrete_agendamento':
        await processarLembreteAgendamento(tenantId, regra, agora, config)
        break
      case 'no_show':
        await processarNoShow(tenantId, regra, agora, config)
        break
      case 'lembrete_dia':
        await processarLembreteDia(tenantId, regra, agora, config)
        break
      default:
        console.warn('[followup] Gatilho desconhecido:', regra.gatilho)
    }
  } catch (err) {
    console.error(`[followup] Erro ao processar regra ${regra.id}:`, err)
  }
}

export async function runFollowups(agora = new Date(), tenantId?: string) {
  let query = supabase
    .from('organizacoes')
    .select('id')
    .eq('ativo', true)
    .is('deleted_at', null)

  if (tenantId) query = query.eq('id', tenantId)

  const { data: tenants } = await query

  for (const tenant of tenants ?? []) {
    const config = await loadTenantConfig(tenant.id)
    if (!config.ativo) continue
    if (!isBusinessHour(agora, config.timezone, config.inicio, config.fim)) continue

    const regras = await loadActiveRules(tenant.id)
    for (const regra of regras) {
      await processarRegra(tenant.id, regra, agora, config)
    }
  }
}
