import { supabase } from '../db/supabase'
import { enviarMensagemViaUAZAPI } from './uazapi-client'
import { processarComAgente } from './claude-agent'
import { comoTextoLocal, somarMinutosTextoLocal, formatarTextoLocal } from './datetime-local'
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

// data_hora é texto local (sem timezone) — extrai direto, sem passar por Date/Intl.
function formatDateTime(dataHora: string) {
  const { data, hora } = formatarTextoLocal(dataHora)
  const [, mes, dia] = data.split('-')
  return { data: `${dia}/${mes}`, hora }
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

async function temAgendamentoFuturo(pacienteId: string, agora: Date, timezone: string) {
  const { data } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('paciente_id', pacienteId)
    .eq('status', 'confirmado')
    .gt('data_hora', comoTextoLocal(agora, timezone))
    .limit(1)

  return (data ?? []).length > 0
}

async function enviar(tenantId: string, regra: FollowupRegra, paciente: any, agendamento: any | null, vars: Record<string, string>, agora: Date) {
  const mensagem = applyTemplate(regra.template, vars)
  const enviado = await enviarMensagemViaUAZAPI({ tenantId, phone: paciente.telefone, text: mensagem })

  if (!enviado) return

  await supabase.from('followup_envios').insert({
    tenant_id: tenantId,
    paciente_id: paciente.id,
    regra_id: regra.id,
    agendamento_id: agendamento?.id ?? null,
    mensagem,
    enviado_em: agora.toISOString(),
  })

  // Também registra na conversa normal — senão a mensagem chega no WhatsApp do
  // paciente mas nunca aparece na tela de Atendimentos, e a Ana não tem como
  // saber depois que esse follow-up já foi enviado.
  await supabase.from('conversas_pacientes').insert({
    tenant_id: tenantId,
    paciente_id: paciente.id,
    tipo_remetente: 'agente',
    modo_humano: false,
    mensagem_agente: mensagem,
    created_at: agora.toISOString(),
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
    if (await temAgendamentoFuturo(paciente.id, agora, config.timezone)) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, null, desdeRegra)) continue

    const mensagemSistema = `[SISTEMA] O lead não responde há algum tempo. Decida se faz sentido mandar uma mensagem curta de retomada, considerando a conversa até aqui. Responda APENAS com a palavra SEM_RESPOSTA (e nada mais) SOMENTE se o lead disse explicitamente que vai responder depois (ex: "já te respondo", "te chamo depois", "deixa eu ver e te falo"). Em qualquer outro caso — incluindo quando ele só fez uma pergunta e ainda não decidiu, ou simplesmente parou de responder sem dizer nada — escreva uma mensagem curta e natural de retomada.`

    const respostaAgente = (await processarComAgente(tenantId, paciente.id, [mensagemSistema])).trim()

    if (respostaAgente.toLowerCase() === 'sem_resposta') {
      const { data: regrasPosteriores } = await supabase
        .from('followup_regras')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('gatilho', 'nao_respondeu')
        .eq('ativo', true)
        .gt('delay_minutos', regra.delay_minutos!)
        .limit(1)

      if ((regrasPosteriores ?? []).length === 0) {
        await supabase
          .from('pacientes')
          .update({ status: 'frio' })
          .eq('id', paciente.id)
          .in('status', ['novo', 'em_conversa'])
      }
      continue
    }

    const enviado = await enviarMensagemViaUAZAPI({ tenantId, phone: paciente.telefone, text: respostaAgente })
    if (!enviado) continue

    await supabase.from('followup_envios').insert({
      tenant_id: tenantId,
      paciente_id: paciente.id,
      regra_id: regra.id,
      agendamento_id: null,
      mensagem: respostaAgente,
      enviado_em: agora.toISOString(),
    })

    // Mesmo motivo do enviar(): sem isso, a mensagem não aparece na tela de
    // Atendimentos e a Ana esquece que já tentou retomar contato.
    await supabase.from('conversas_pacientes').insert({
      tenant_id: tenantId,
      paciente_id: paciente.id,
      tipo_remetente: 'agente',
      modo_humano: false,
      mensagem_agente: respostaAgente,
      created_at: agora.toISOString(),
    })
  }
}

async function processarLembreteAgendamento(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const agoraLocal = comoTextoLocal(agora, config.timezone)
  const desde = somarMinutosTextoLocal(agoraLocal, regra.delay_minutos! - 10)
  const ate = somarMinutosTextoLocal(agoraLocal, regra.delay_minutos! + 10)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*), servico:servicos(*), profissional:profissionais(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', desde)
    .lte('data_hora', ate)

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    const servico = (ag as any).servico
    const profissional = (ag as any).profissional

    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    const { data, hora } = formatDateTime(ag.data_hora)
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
  const agoraLocal = comoTextoLocal(agora, config.timezone)
  const desde = somarMinutosTextoLocal(agoraLocal, -60)
  const ate = somarMinutosTextoLocal(agoraLocal, -15)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', desde)
    .lte('data_hora', ate)

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    await enviar(tenantId, regra, paciente, ag, { nome: paciente.nome || 'tudo bem' }, agora)
  }
}

async function processarLembreteDia(tenantId: string, regra: FollowupRegra, agora: Date, config: TenantConfig) {
  const agoraLocal = comoTextoLocal(agora, config.timezone)
  const horaAtual = agoraLocal.substring(11, 16)

  const horarioFixo = (regra.horario_fixo ?? '08:00').substring(0, 5)
  if (horaAtual < horarioFixo) return

  const hojeStr = agoraLocal.substring(0, 10)

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(*), servico:servicos(*), profissional:profissionais(*)')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmado')
    .gte('data_hora', `${hojeStr}T00:00:00`)
    .lte('data_hora', `${hojeStr}T23:59:59`)
    .gt('data_hora', agoraLocal)

  for (const ag of agendamentos ?? []) {
    const paciente = (ag as any).paciente
    const servico = (ag as any).servico
    const profissional = (ag as any).profissional
    if (!paciente) continue

    const desdeRegra = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (await jaEnviou(regra.id, paciente.id, ag.id, desdeRegra)) continue

    const { hora } = formatDateTime(ag.data_hora)
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
