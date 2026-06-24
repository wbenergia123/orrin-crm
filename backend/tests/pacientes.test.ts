import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: 'sec@clinica.com', senha_hash: hash, role: 'secretaria' }, { onConflict: 'email' })
  const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
  // limpa pacientes de execuções anteriores deste teste — exige telefone E nome
  // batendo juntos, pra não arriscar apagar um paciente real de outra clínica
  // que coincida só no telefone (esses números são bem genéricos)
  await supabase.from('pacientes').delete().in('telefone', ['5511999990001', '5511999990002']).in('nome', ['Teste Novo', 'Maria Teste'])
})

describe('GET /api/pacientes', () => {
  it('retorna lista de pacientes', async () => {
    const res = await request(app).get('/api/pacientes').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filtra por status', async () => {
    await supabase.from('pacientes').upsert({ telefone: '5511999990001', nome: 'Teste Novo', status: 'novo' }, { onConflict: 'telefone' })
    const res = await request(app)
      .get('/api/pacientes?status=novo')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.every((p: { status: string }) => p.status === 'novo')).toBe(true)
  })

  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/pacientes')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/pacientes', () => {
  it('cria paciente com telefone único', async () => {
    const res = await request(app)
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '5511999990002', nome: 'Maria Teste', status: 'novo' })
    expect(res.status).toBe(201)
    expect(res.body.telefone).toBe('5511999990002')
  })

  it('retorna 400 com telefone inválido', async () => {
    const res = await request(app)
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '123', nome: 'Curto' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/pacientes/:id/status', () => {
  it('atualiza status do paciente', async () => {
    const { data } = await supabase.from('pacientes').select('id').eq('telefone', '5511999990002').single()
    const res = await request(app)
      .patch(`/api/pacientes/${data!.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'em_conversa' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('em_conversa')
  })

  it('retorna 400 com status inválido', async () => {
    const { data } = await supabase.from('pacientes').select('id').eq('telefone', '5511999990002').single()
    const res = await request(app)
      .patch(`/api/pacientes/${data!.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalido' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/pacientes/:id', () => {
  it('retorna paciente por id', async () => {
    const { data } = await supabase.from('pacientes').select('id').eq('telefone', '5511999990002').single()
    const res = await request(app)
      .get(`/api/pacientes/${data!.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.telefone).toBe('5511999990002')
  })
})
