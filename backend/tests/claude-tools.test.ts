import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  executarListarProfissionais,
  executarVerificarSlots,
  executarCriarAgendamento,
  executarRemarcarAgendamento,
} from '../src/lib/claude-tools'
import { supabase } from '../src/db/supabase'

let tenantId: string
let pacienteId: string
let servicoId: string
let profissionalId: string
let agendamentoId: string

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'claude-tools-test', nome: 'Claude Tools Test' })
    .select('id')
    .single()
  tenantId = org!.id

  const { data: p } = await supabase
    .from('pacientes')
    .insert({ tenant_id: tenantId, telefone: '5511988880099', nome: 'Paciente Tool Test' })
    .select('id')
    .single()
  pacienteId = p!.id

  const { data: s } = await supabase
    .from('servicos')
    .insert({ tenant_id: tenantId, nome: 'Serviço Teste', preco: 100, duracao_minutos: 60, ativo: true })
    .select('id')
    .single()
  servicoId = s!.id

  const { data: pr } = await supabase
    .from('profissionais')
    .insert({ tenant_id: tenantId, nome: 'Profissional Teste', ativo: true })
    .select('id')
    .single()
  profissionalId = pr!.id
})

afterAll(async () => {
  if (agendamentoId) await supabase.from('agendamentos').delete().eq('id', agendamentoId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  await supabase.from('servicos').delete().eq('id', servicoId)
  await supabase.from('profissionais').delete().eq('id', profissionalId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('executarListarProfissionais', () => {
  it('retorna profissionais ativos', async () => {
    const result = await executarListarProfissionais(tenantId)
    expect(Array.isArray(result.profissionais)).toBe(true)
    expect(result.profissionais.length).toBeGreaterThan(0)
    expect(result.profissionais[0]).toHaveProperty('id')
    expect(result.profissionais[0]).toHaveProperty('nome')
  })
})

describe('executarVerificarSlots', () => {
  it('retorna disponibilidade para um profissional em uma data futura', async () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = amanha.toISOString().substring(0, 10)

    const result = await executarVerificarSlots({
      data_inicio: amanhaStr,
      data_fim: amanhaStr,
      profissional_id: profissionalId,
    }, tenantId)

    expect(Array.isArray(result.disponibilidade)).toBe(true)
    if (result.disponibilidade.length > 0) {
      expect(result.disponibilidade[0].slots.length).toBeGreaterThan(0)
      expect(result.disponibilidade[0].profissional_id).toBe(profissionalId)
    }
  })

  it('retorna disponibilidade de todos profissionais quando profissional_id omitido', async () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = amanha.toISOString().substring(0, 10)

    const result = await executarVerificarSlots({
      data_inicio: amanhaStr,
      data_fim: amanhaStr,
    }, tenantId)

    expect(Array.isArray(result.disponibilidade)).toBe(true)
  })

  it('marca o horário ocupado exatamente na hora salva, sem deslocar 3h', async () => {
    const dataFutura = new Date()
    dataFutura.setDate(dataFutura.getDate() + 35)
    const dataStr = dataFutura.toISOString().substring(0, 10)

    const { data: ocupado } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: `${dataStr}T14:00:00`,
        status: 'agendado',
      })
      .select('id')
      .single()

    const result = await executarVerificarSlots({
      data_inicio: dataStr,
      data_fim: dataStr,
      profissional_id: profissionalId,
    }, tenantId)

    const slots = result.disponibilidade.find((d) => d.data === dataStr)?.slots ?? []
    expect(slots).not.toContain('14:00')
    expect(slots).toContain('11:00') // não deve ficar ocupado por engano

    await supabase.from('agendamentos').delete().eq('id', ocupado!.id)
  })
})

describe('executarCriarAgendamento', () => {
  it('cria agendamento futuro e atualiza status do paciente', async () => {
    const dataFutura = new Date()
    dataFutura.setDate(dataFutura.getDate() + 30)
    const dataHora = `${dataFutura.toISOString().substring(0, 10)}T10:00:00`

    const result = await executarCriarAgendamento(pacienteId, {
      paciente_id: pacienteId,
      servico_id: servicoId,
      profissional_id: profissionalId,
      data_hora: dataHora,
    }, tenantId)

    expect(result.sucesso).toBe(true)
    if (result.sucesso) {
      agendamentoId = (result as { sucesso: true; agendamento_id: string }).agendamento_id
      expect(agendamentoId).toBeTruthy()
    }

    // Verifica que status do paciente foi atualizado
    const { data: paciente } = await supabase
      .from('pacientes').select('status').eq('id', pacienteId).single()
    expect(paciente?.status).toBe('consulta_agendada')
  })

  it('retorna slot_ocupado em double-booking', async () => {
    const dataFutura = new Date()
    dataFutura.setDate(dataFutura.getDate() + 30)
    const dataHora = `${dataFutura.toISOString().substring(0, 10)}T10:00:00`

    // Garante que existe uma entrada conflitante independentemente do teste anterior
    if (!agendamentoId) {
      const { data } = await supabase
        .from('agendamentos')
        .insert({ paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: `${dataHora}-03:00`, status: 'agendado' })
        .select('id').single()
      agendamentoId = data!.id
    }

    const result = await executarCriarAgendamento(pacienteId, {
      paciente_id: pacienteId,
      servico_id: servicoId,
      profissional_id: profissionalId,
      data_hora: dataHora,
    }, tenantId)

    expect(result.sucesso).toBe(false)
    if (!result.sucesso) {
      expect((result as { sucesso: false; erro: string }).erro).toBe('slot_ocupado')
    }
  })
})

describe('executarRemarcarAgendamento', () => {
  let remarcarAgendamentoId: string
  let remarcarConflitoId: string

  beforeAll(async () => {
    const dataOriginal = new Date()
    dataOriginal.setDate(dataOriginal.getDate() + 40)
    const { data } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: `${dataOriginal.toISOString().substring(0, 10)}T09:00:00-03:00`,
        status: 'confirmado',
      })
      .select('id')
      .single()
    remarcarAgendamentoId = data!.id
  })

  afterAll(async () => {
    await supabase.from('agendamentos').delete().eq('id', remarcarAgendamentoId)
    if (remarcarConflitoId) await supabase.from('agendamentos').delete().eq('id', remarcarConflitoId)
  })

  it('remarca pra um novo horário e volta o status pra agendado', async () => {
    const novaData = new Date()
    novaData.setDate(novaData.getDate() + 41)
    const novaDataHora = `${novaData.toISOString().substring(0, 10)}T14:00:00`

    const result = await executarRemarcarAgendamento({
      agendamento_id: remarcarAgendamentoId,
      data_hora: novaDataHora,
    }, pacienteId, tenantId)

    expect(result.sucesso).toBe(true)

    const { data: ag } = await supabase
      .from('agendamentos')
      .select('data_hora, status')
      .eq('id', remarcarAgendamentoId)
      .single()
    expect(ag?.status).toBe('agendado')
    expect(ag?.data_hora).toContain(novaData.toISOString().substring(0, 10))
  })

  it('retorna slot_ocupado se o novo horário já está ocupado por outro agendamento do mesmo profissional', async () => {
    const dataConflito = new Date()
    dataConflito.setDate(dataConflito.getDate() + 42)
    const dataHoraConflito = `${dataConflito.toISOString().substring(0, 10)}T11:00:00`

    const { data: conflito } = await supabase
      .from('agendamentos')
      .insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        data_hora: `${dataHoraConflito}-03:00`,
        status: 'agendado',
      })
      .select('id')
      .single()
    remarcarConflitoId = conflito!.id

    const result = await executarRemarcarAgendamento({
      agendamento_id: remarcarAgendamentoId,
      data_hora: dataHoraConflito,
    }, pacienteId, tenantId)

    expect(result.sucesso).toBe(false)
    if (!result.sucesso) {
      expect((result as { sucesso: false; erro: string }).erro).toBe('slot_ocupado')
    }
  })
})
