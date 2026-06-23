import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import { supabase } from '../src/db/supabase'
import { runFollowups } from '../src/lib/followup-runner'

let testTenantId: string
let pacienteId: string
let servicoId: string
let profissionalId: string
let agendamentoId: string
let lembreteRegraId: string
let naoRespondeuRegraId: string
let noShowRegraId: string
let lembreteDiaRegraId: string

let receivedMessages: { number: string; text: string }[] = []
let serverUrl: string
let server: ReturnType<typeof createServer>

function startTestServer(): Promise<void> {
  return new Promise((resolve) => {
    receivedMessages = []
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        if (req.url === '/send/text') {
          receivedMessages.push(JSON.parse(body))
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
    })
    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      serverUrl = `http://localhost:${port}`
      process.env.UAZAPI_URL = serverUrl
      process.env.UAZAPI_TOKEN = 'test-token'
      resolve()
    })
  })
}

function stopTestServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

async function cleanup() {
  await supabase.from('followup_envios').delete().eq('tenant_id', testTenantId)
  await supabase.from('followup_regras').delete().eq('tenant_id', testTenantId)
  await supabase.from('agendamentos').delete().eq('tenant_id', testTenantId)
  await supabase.from('pacientes').delete().eq('tenant_id', testTenantId)
  await supabase.from('servicos').delete().eq('tenant_id', testTenantId)
  await supabase.from('profissionais').delete().eq('tenant_id', testTenantId)
  await supabase.from('organizacoes').delete().eq('id', testTenantId)
}

beforeAll(async () => {
  await startTestServer()

  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'followup-test', nome: 'Follow-up Test' })
    .select('id')
    .single()
  testTenantId = org!.id

  await supabase.from('configuracoes').upsert({
    tenant_id: testTenantId,
    chave: 'followup_ativo',
    valor: 'true',
  }, { onConflict: 'tenant_id,chave' })

  const { data: servico } = await supabase
    .from('servicos')
    .insert({ tenant_id: testTenantId, nome: 'Limpeza de Pele', preco: 200, duracao_minutos: 60 })
    .select('id')
    .single()
  servicoId = servico!.id

  const { data: profissional } = await supabase
    .from('profissionais')
    .insert({ tenant_id: testTenantId, nome: 'Dra. Teste' })
    .select('id')
    .single()
  profissionalId = profissional!.id

  const { data: paciente } = await supabase
    .from('pacientes')
    .insert({ tenant_id: testTenantId, telefone: '5511999990001', nome: 'Maria Teste', status: 'novo' })
    .select('id')
    .single()
  pacienteId = paciente!.id

  const rules = [
    { tenant_id: testTenantId, nome: 'Lembrete 24h', gatilho: 'lembrete_agendamento', delay_minutos: 24 * 60, template: 'Oi [nome], amanhã você tem [servico] às [hora]. Confirma?', ativo: true, ordem_prioridade: 10 },
    { tenant_id: testTenantId, nome: 'Não respondeu', gatilho: 'nao_respondeu', delay_minutos: 60, template: 'Oi [nome], vi que você entrou em contato. Ainda tem interesse?', ativo: true, ordem_prioridade: 5 },
    { tenant_id: testTenantId, nome: 'No-show', gatilho: 'no_show', delay_minutos: 30, template: 'Oi [nome], vi que não conseguiu vir. Quer remarcar?', ativo: true, ordem_prioridade: 8 },
    { tenant_id: testTenantId, nome: 'Lembrete do dia', gatilho: 'lembrete_dia', horario_fixo: '10:00', template: 'Oi [nome], hoje você tem [servico] às [hora] com [profissional]. Te esperamos!', ativo: true, ordem_prioridade: 12 },
  ]
  const { data: insertedRules } = await supabase.from('followup_regras').insert(rules).select('id,gatilho')
  const ruleMap = Object.fromEntries(insertedRules!.map((r) => [r.gatilho, r.id]))
  lembreteRegraId = ruleMap['lembrete_agendamento']
  naoRespondeuRegraId = ruleMap['nao_respondeu']
  noShowRegraId = ruleMap['no_show']
  lembreteDiaRegraId = ruleMap['lembrete_dia']
})

afterAll(async () => {
  await cleanup()
  await stopTestServer()
})

describe('runFollowups', () => {
  it('envia lembrete 24h antes do agendamento confirmado', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T10:00:00-03:00')
    const dataHora = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000)

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()
    agendamentoId = ag!.id

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].number).toBe('5511999990001')
    expect(receivedMessages[0].text).toContain('Limpeza de Pele')
    expect(receivedMessages[0].text).toContain('Maria Teste')

    const { data: envios } = await supabase
      .from('followup_envios')
      .select('*')
      .eq('tenant_id', testTenantId)
    expect(envios?.length).toBe(1)
    expect(envios?.[0].regra_id).toBe(lembreteRegraId)
    expect(envios?.[0].agendamento_id).toBe(agendamentoId)

    await supabase.from('followup_envios').delete().eq('tenant_id', testTenantId)
    await supabase.from('agendamentos').delete().eq('id', agendamentoId)
  })

  it('envia follow-up quando paciente não respondeu em 1h', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T15:00:00-03:00')
    const ultimoContato = new Date(baseTime.getTime() - 60 * 60 * 1000)

    await supabase
      .from('pacientes')
      .update({ ultimo_contato_at: ultimoContato.toISOString(), status: 'em_conversa' })
      .eq('id', pacienteId)

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].text).toContain('Ainda tem interesse')

    await supabase.from('followup_envios').delete().eq('tenant_id', testTenantId)
  })

  it('não envia follow-up de não respondeu se paciente tem agendamento futuro confirmado', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T15:00:00-03:00')
    const ultimoContato = new Date(baseTime.getTime() - 60 * 60 * 1000)
    const dataHora = new Date(baseTime.getTime() + 2 * 24 * 60 * 60 * 1000)

    await supabase
      .from('pacientes')
      .update({ ultimo_contato_at: ultimoContato.toISOString(), status: 'em_conversa' })
      .eq('id', pacienteId)

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(0)

    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })

  it('envia no-show quando paciente faltou ao agendamento confirmado', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T15:00:00-03:00')
    const dataHora = new Date(baseTime.getTime() - 30 * 60 * 1000)

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].text).toContain('não conseguiu vir')

    await supabase.from('followup_envios').delete().eq('tenant_id', testTenantId)
    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })

  it('não envia mensagem fora do horário comercial', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T04:00:00-03:00')
    const dataHora = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000)

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(0)

    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })

  it('envia lembrete do dia quando já passou do horário fixo e o agendamento de hoje ainda não aconteceu', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T10:30:00-03:00')
    const dataHora = new Date('2026-06-24T14:00:00-03:00')

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].text).toContain('hoje você tem')
    expect(receivedMessages[0].text).toContain('Limpeza de Pele')
    expect(receivedMessages[0].text).toContain('Dra. Teste')

    const { data: envios } = await supabase
      .from('followup_envios')
      .select('*')
      .eq('tenant_id', testTenantId)
    expect(envios?.length).toBe(1)
    expect(envios?.[0].regra_id).toBe(lembreteDiaRegraId)

    await supabase.from('followup_envios').delete().eq('tenant_id', testTenantId)
    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })

  it('não envia lembrete do dia antes do horário fixo configurado', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T09:00:00-03:00')
    const dataHora = new Date('2026-06-24T14:00:00-03:00')

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(0)

    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })

  it('não envia lembrete do dia se o agendamento de hoje já aconteceu', async () => {
    receivedMessages = []

    const baseTime = new Date('2026-06-24T10:30:00-03:00')
    const dataHora = new Date('2026-06-24T08:00:00-03:00')

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: testTenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: dataHora.toISOString(),
        status: 'confirmado',
      })
      .select('id')
      .single()

    await runFollowups(baseTime, testTenantId)

    expect(receivedMessages.length).toBe(0)

    await supabase.from('agendamentos').delete().eq('id', ag!.id)
  })
})
