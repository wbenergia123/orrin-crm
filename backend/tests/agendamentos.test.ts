import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let pacienteId: string
let servicoId: string
let profissionalId: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: 'sec5@clinica.com', senha_hash: hash, role: 'secretaria' }, { onConflict: 'email' })
  const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec5@clinica.com', senha: 'senha123' })
  token = loginRes.body.token

  const { data: p } = await supabase.from('pacientes').upsert({ telefone: '5511988880001', nome: 'Paciente Agend' }, { onConflict: 'telefone' }).select('id').single()
  pacienteId = p!.id
  const { data: s } = await supabase.from('servicos').select('id').eq('ativo', true).limit(1).single()
  servicoId = s!.id
  const { data: pr } = await supabase.from('profissionais').select('id').limit(1).single()
  profissionalId = pr!.id

  // clean up test appointments
  await supabase.from('agendamentos').delete().eq('paciente_id', pacienteId)
})

afterAll(async () => {
  await supabase.from('agendamentos').delete().eq('paciente_id', pacienteId)
})

describe('POST /api/agendamentos', () => {
  it('cria agendamento em horário válido', async () => {
    const dataHora = new Date()
    dataHora.setDate(dataHora.getDate() + 1)
    dataHora.setHours(10, 0, 0, 0)

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: dataHora.toISOString() })
    expect(res.status).toBe(201)
    expect(res.body.paciente_id).toBe(pacienteId)
  })

  it('rejeita horário fora do expediente (20h)', async () => {
    const dataHora = new Date()
    dataHora.setDate(dataHora.getDate() + 2)
    dataHora.setHours(20, 0, 0, 0)

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: dataHora.toISOString() })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expediente/)
  })

  it('rejeita horário fora do expediente (7h)', async () => {
    const dataHora = new Date()
    dataHora.setDate(dataHora.getDate() + 3)
    dataHora.setHours(7, 0, 0, 0)

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: dataHora.toISOString() })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expediente/)
  })
})

describe('GET /api/agendamentos/slots-disponiveis', () => {
  it('retorna array de slots para data e profissional', async () => {
    const data = new Date()
    data.setDate(data.getDate() + 5)
    const dataStr = data.toISOString().split('T')[0]

    const res = await request(app)
      .get(`/api/agendamentos/slots-disponiveis?data=${dataStr}&profissional_id=${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('retorna 400 sem parâmetros', async () => {
    const res = await request(app)
      .get('/api/agendamentos/slots-disponiveis')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/agendamentos', () => {
  it('retorna lista de agendamentos com joins', async () => {
    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('PATCH /api/agendamentos/:id', () => {
  it('atualiza status do agendamento', async () => {
    const { data } = await supabase.from('agendamentos').select('id').eq('paciente_id', pacienteId).limit(1).single()
    const res = await request(app)
      .patch(`/api/agendamentos/${data!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmado' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmado')
  })
})
