import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  executarListarProfissionais,
  executarVerificarSlots,
  executarCriarAgendamento,
} from '../src/lib/claude-tools'
import { supabase } from '../src/db/supabase'

let pacienteId: string
let servicoId: string
let profissionalId: string
let agendamentoId: string

beforeAll(async () => {
  const { data: p } = await supabase
    .from('pacientes')
    .upsert({ telefone: '5511988880099', nome: 'Paciente Tool Test' }, { onConflict: 'telefone' })
    .select('id').single()
  pacienteId = p!.id

  const { data: s } = await supabase.from('servicos').select('id').eq('ativo', true).limit(1).single()
  servicoId = s!.id

  const { data: pr } = await supabase.from('profissionais').select('id').eq('ativo', true).limit(1).single()
  profissionalId = pr!.id
})

afterAll(async () => {
  if (agendamentoId) await supabase.from('agendamentos').delete().eq('id', agendamentoId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('executarListarProfissionais', () => {
  it('retorna profissionais ativos', async () => {
    const result = await executarListarProfissionais()
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
    })

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
    })

    expect(Array.isArray(result.disponibilidade)).toBe(true)
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
    })

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
    })

    expect(result.sucesso).toBe(false)
    if (!result.sucesso) {
      expect((result as { sucesso: false; erro: string }).erro).toBe('slot_ocupado')
    }
  })
})
