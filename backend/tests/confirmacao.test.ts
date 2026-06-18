import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  executarConfirmarAgendamento,
  executarCancelarAgendamento,
} from '../src/lib/claude-tools'
import { supabase } from '../src/db/supabase'
import { buscarAgendamentosParaLembrete } from '../src/jobs/confirmacao-agendamentos'

let pacienteId: string
let agendamentoParaConfirmar: string
let agendamentoParaCancelar: string

beforeAll(async () => {
  const { data: p } = await supabase
    .from('pacientes')
    .upsert({ telefone: '5511988880098', nome: 'Paciente Confirmacao Test' }, { onConflict: 'telefone' })
    .select('id').single()
  pacienteId = p!.id

  const { data: s } = await supabase.from('servicos').select('id').eq('ativo', true).limit(1).single()
  const { data: pr } = await supabase.from('profissionais').select('id').eq('ativo', true).limit(1).single()

  const dataBase = new Date()
  dataBase.setDate(dataBase.getDate() + 7)
  const dataStr = dataBase.toISOString().substring(0, 10)

  // Agendamento separado para cada teste
  const { data: ag1 } = await supabase
    .from('agendamentos')
    .insert({
      paciente_id: pacienteId,
      servico_id: s!.id,
      profissional_id: pr!.id,
      data_hora: `${dataStr}T14:00:00-03:00`,
      status: 'agendado',
    })
    .select('id').single()
  agendamentoParaConfirmar = ag1!.id

  const { data: ag2 } = await supabase
    .from('agendamentos')
    .insert({
      paciente_id: pacienteId,
      servico_id: s!.id,
      profissional_id: pr!.id,
      data_hora: `${dataStr}T15:00:00-03:00`,
      status: 'agendado',
    })
    .select('id').single()
  agendamentoParaCancelar = ag2!.id
})

afterAll(async () => {
  for (const id of [agendamentoParaConfirmar, agendamentoParaCancelar]) {
    if (id) await supabase.from('agendamentos').delete().eq('id', id)
  }
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('executarConfirmarAgendamento', () => {
  it('atualiza status para confirmado', async () => {
    const result = await executarConfirmarAgendamento(agendamentoParaConfirmar, pacienteId)
    expect(result.sucesso).toBe(true)

    const { data } = await supabase
      .from('agendamentos').select('status').eq('id', agendamentoParaConfirmar).single()
    expect(data?.status).toBe('confirmado')
  })
})

describe('executarCancelarAgendamento', () => {
  it('atualiza status para cancelado', async () => {
    const result = await executarCancelarAgendamento(agendamentoParaCancelar, pacienteId)
    expect(result.sucesso).toBe(true)

    const { data } = await supabase
      .from('agendamentos').select('status').eq('id', agendamentoParaCancelar).single()
    expect(data?.status).toBe('cancelado')
  })
})

describe('buscarAgendamentosParaLembrete', () => {
  let agAmanha: string
  let agComLembrete: string
  let agConfirmado: string

  beforeAll(async () => {
    const { data: s } = await supabase.from('servicos').select('id').eq('ativo', true).limit(1).single()
    const { data: pr } = await supabase.from('profissionais').select('id').eq('ativo', true).limit(1).single()

    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = amanha.toISOString().substring(0, 10)

    // Agendamento para amanhã às 10h — deve ser incluído
    const { data: a1 } = await supabase.from('agendamentos').insert({
      paciente_id: pacienteId,
      servico_id: s!.id,
      profissional_id: pr!.id,
      data_hora: `${amanhaStr}T10:00:00-03:00`,
      status: 'agendado',
    }).select('id').single()
    agAmanha = a1!.id

    // Agendamento amanhã mas já com lembrete enviado — NÃO deve ser incluído
    const { data: a2 } = await supabase.from('agendamentos').insert({
      paciente_id: pacienteId,
      servico_id: s!.id,
      profissional_id: pr!.id,
      data_hora: `${amanhaStr}T11:00:00-03:00`,
      status: 'agendado',
      lembrete_enviado_em: new Date().toISOString(),
    } as any).select('id').single()
    agComLembrete = a2!.id

    // Agendamento amanhã mas confirmado — NÃO deve ser incluído
    const { data: a3 } = await supabase.from('agendamentos').insert({
      paciente_id: pacienteId,
      servico_id: s!.id,
      profissional_id: pr!.id,
      data_hora: `${amanhaStr}T12:00:00-03:00`,
      status: 'confirmado',
    }).select('id').single()
    agConfirmado = a3!.id
  })

  afterAll(async () => {
    for (const id of [agAmanha, agComLembrete, agConfirmado]) {
      if (id) await supabase.from('agendamentos').delete().eq('id', id)
    }
  })

  it('retorna apenas agendamentos de amanhã sem lembrete e sem status final', async () => {
    const resultado = await buscarAgendamentosParaLembrete()
    const ids = resultado.map((ag) => ag.id)

    expect(ids).toContain(agAmanha)
    expect(ids).not.toContain(agComLembrete)
    expect(ids).not.toContain(agConfirmado)
  })
})
