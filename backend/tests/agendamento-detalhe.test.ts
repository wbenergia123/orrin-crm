import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let pacienteId: string
let profissionalId: string
let servicoId: string
let agendamentoId: string
let agendamentoAnteriorId: string

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@clinica.com', senha: 'admin123' })
  expect(res.status).toBe(200)
  token = res.body.token
  expect(token).toBeTruthy()

  const { data: prof } = await supabase.from('profissionais').select('id').eq('ativo', true).limit(1).single()
  profissionalId = prof!.id
  const { data: serv } = await supabase.from('servicos').select('id, duracao_minutos').eq('ativo', true).limit(1).single()
  servicoId = serv!.id

  const { data: p } = await supabase
    .from('pacientes')
    .upsert({ telefone: '5541988880099', nome: 'Painel Test' }, { onConflict: 'telefone' })
    .select('id').single()
  pacienteId = p!.id

  const dataAnterior = new Date()
  dataAnterior.setDate(dataAnterior.getDate() - 30)
  dataAnterior.setHours(9, 0, 0, 0)
  const { data: agAnt } = await supabase
    .from('agendamentos')
    .insert({ paciente_id: pacienteId, profissional_id: profissionalId, servico_id: servicoId, data_hora: dataAnterior.toISOString(), status: 'confirmado' })
    .select('id').single()
  agendamentoAnteriorId = agAnt!.id

  const dataFutura = new Date()
  dataFutura.setDate(dataFutura.getDate() + 7)
  dataFutura.setHours(10, 0, 0, 0)
  const { data: ag } = await supabase
    .from('agendamentos')
    .insert({ paciente_id: pacienteId, profissional_id: profissionalId, servico_id: servicoId, data_hora: dataFutura.toISOString(), status: 'agendado', notas: 'Alergia a látex' })
    .select('id').single()
  agendamentoId = ag!.id
})

afterAll(async () => {
  await supabase.from('agendamentos').delete().in('id', [agendamentoId, agendamentoAnteriorId])
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('GET /api/agendamentos/:id', () => {
  it('retorna detalhes completos com joins', async () => {
    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(agendamentoId)
    expect(res.body.notas).toBe('Alergia a látex')
    expect(res.body.servico).toBeDefined()
    expect(res.body.servico.duracao_minutos).toBeGreaterThan(0)
    expect(res.body.profissional).toBeDefined()
    expect(res.body.paciente).toBeDefined()
    expect(res.body.paciente.telefone).toBe('5541988880099')
  })

  it('retorna histórico correto', async () => {
    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.historico).toBeDefined()
    expect(res.body.historico.contagem).toBe(1)
    expect(res.body.historico.ultima_data).toBeTruthy()
  })

  it('retorna historico.contagem 0 para primeira consulta', async () => {
    await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', agendamentoAnteriorId)

    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.body.historico.contagem).toBe(0)
    expect(res.body.historico.ultima_data).toBeNull()

    await supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', agendamentoAnteriorId)
  })

  it('retorna 404 para id inexistente', async () => {
    const res = await request(app)
      .get('/api/agendamentos/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})
