import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getAgendamentosPendentes, getHistoricoConversa, getModeloAna, invalidarCachePrompt } from '../src/lib/claude-agent'
import { supabase } from '../src/db/supabase'

let tenantId: string
let pacienteId: string
let servicoId: string
let profissionalId: string
let agendamentoAgendadoId: string
let agendamentoConfirmadoId: string
let agendamentoCanceladoId: string

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'claude-agent-test', nome: 'Claude Agent Test' })
    .select('id')
    .single()
  tenantId = org!.id

  const { data: p } = await supabase
    .from('pacientes')
    .insert({ tenant_id: tenantId, telefone: '5511988880199', nome: 'Paciente Agent Test' })
    .select('id')
    .single()
  pacienteId = p!.id

  const { data: s } = await supabase
    .from('servicos')
    .insert({ tenant_id: tenantId, nome: 'Serviço Agent Test', preco: 100, duracao_minutos: 60, ativo: true })
    .select('id')
    .single()
  servicoId = s!.id

  const { data: pr } = await supabase
    .from('profissionais')
    .insert({ tenant_id: tenantId, nome: 'Profissional Agent Test', ativo: true })
    .select('id')
    .single()
  profissionalId = pr!.id

  // Horários diferentes pra não colidir com a unique constraint de slot (tenant+profissional+data_hora)
  const em24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const em25h = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
  const em26h = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

  const { data: agendado } = await supabase
    .from('agendamentos')
    .insert({ tenant_id: tenantId, paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: em24h, status: 'agendado' })
    .select('id')
    .single()
  agendamentoAgendadoId = agendado!.id

  const { data: confirmado } = await supabase
    .from('agendamentos')
    .insert({ tenant_id: tenantId, paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: em25h, status: 'confirmado' })
    .select('id')
    .single()
  agendamentoConfirmadoId = confirmado!.id

  const { data: cancelado } = await supabase
    .from('agendamentos')
    .insert({ tenant_id: tenantId, paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: em26h, status: 'cancelado' })
    .select('id')
    .single()
  agendamentoCanceladoId = cancelado!.id
})

afterAll(async () => {
  await supabase.from('agendamentos').delete().in('id', [agendamentoAgendadoId, agendamentoConfirmadoId, agendamentoCanceladoId])
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  await supabase.from('servicos').delete().eq('id', servicoId)
  await supabase.from('profissionais').delete().eq('id', profissionalId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('getAgendamentosPendentes', () => {
  it('inclui agendamentos com status agendado e confirmado, exclui cancelado', async () => {
    const result = await getAgendamentosPendentes(pacienteId, tenantId)
    const ids = result.map((ag) => ag.id)

    expect(ids).toContain(agendamentoAgendadoId)
    expect(ids).toContain(agendamentoConfirmadoId)
    expect(ids).not.toContain(agendamentoCanceladoId)
  })
})

describe('getHistoricoConversa', () => {
  it('retorna as 10 mensagens mais recentes, em ordem cronológica', async () => {
    const base = Date.now()
    const linhas = Array.from({ length: 15 }, (_, i) => ({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      mensagem_paciente: `Pergunta ${i + 1}`,
      mensagem_agente: `Resposta ${i + 1}`,
      tipo_remetente: 'humano' as const,
      modo_humano: false,
      created_at: new Date(base + i * 1000).toISOString(),
    }))
    await supabase.from('conversas_pacientes').insert(linhas)

    const result = await getHistoricoConversa(pacienteId)

    expect(result.length).toBe(10)
    // As 5 primeiras (mais antigas) não devem aparecer — só as 10 últimas
    expect(result.map((r) => r.mensagem_paciente)).not.toContain('Pergunta 1')
    expect(result.map((r) => r.mensagem_paciente)).not.toContain('Pergunta 5')
    // Continua em ordem cronológica (mais antiga primeiro, mais recente por último)
    expect(result[0].mensagem_paciente).toBe('Pergunta 6')
    expect(result[9].mensagem_paciente).toBe('Pergunta 15')

    await supabase.from('conversas_pacientes').delete().eq('paciente_id', pacienteId)
  })
})

describe('getModeloAna', () => {
  afterAll(async () => {
    await supabase.from('configuracoes').delete().eq('tenant_id', tenantId).eq('chave', 'ana_model')
  })

  it('usa o padrão global quando a clínica não tem modelo configurado', async () => {
    const modelo = await getModeloAna(tenantId)
    expect(modelo).toBe(process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001')
  })

  it('usa o modelo configurado pra clínica quando existe', async () => {
    await supabase.from('configuracoes').insert({ tenant_id: tenantId, chave: 'ana_model', valor: 'claude-sonnet-4-6' })
    invalidarCachePrompt(tenantId) // limpa o cache pra refletir o valor recém-criado
    const modelo = await getModeloAna(tenantId)
    expect(modelo).toBe('claude-sonnet-4-6')
  })
})
