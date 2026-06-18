import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let pacienteId: string

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@clinica.com', senha: 'admin123' })
  expect(res.status).toBe(200)
  token = res.body.token
  expect(token).toBeTruthy()

  const { data: p } = await supabase
    .from('pacientes')
    .upsert({ telefone: '5541999990099', nome: 'Chat Test', ultimo_contato_at: new Date().toISOString() }, { onConflict: 'telefone' })
    .select('id').single()
  pacienteId = p!.id

  await supabase.from('conversas').insert({
    paciente_id: pacienteId,
    mensagem_paciente: 'Quero agendar botox',
    mensagem_agente: 'Olá! Posso ajudar.',
    tipo_remetente: 'agente',
    modo_humano: false,
  })
  // Insert second conversa slightly later to ensure ordering
  await new Promise((r) => setTimeout(r, 50))
  await supabase.from('conversas').insert({
    paciente_id: pacienteId,
    mensagem_paciente: 'Qual o preço?',
    mensagem_agente: null,
    tipo_remetente: 'humano',
    modo_humano: true,
  })
})

afterAll(async () => {
  await supabase.from('conversas').delete().eq('paciente_id', pacienteId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('GET /api/atendimentos/resumo', () => {
  it('retorna campos calculados', async () => {
    const res = await request(app)
      .get('/api/atendimentos/resumo')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const paciente = res.body.find((a: { id: string }) => a.id === pacienteId)
    expect(paciente).toBeDefined()
    expect(paciente.modo_humano).toBe(true)
    expect(paciente.nao_lidas).toBe(true)
    expect(paciente.ultima_mensagem_preview).toContain('preço')
  })

  it('busca normaliza telefone', async () => {
    const res = await request(app)
      .get('/api/atendimentos/resumo?busca=41999990099')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const paciente = res.body.find((a: { id: string }) => a.id === pacienteId)
    expect(paciente).toBeDefined()
  })
})

describe('GET /api/atendimentos/:id/conversas', () => {
  it('retorna histórico ordenado por data', async () => {
    const res = await request(app)
      .get(`/api/atendimentos/${pacienteId}/conversas`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(2)

    const datas = res.body.map((c: { created_at: string }) => new Date(c.created_at).getTime())
    for (let i = 1; i < datas.length; i++) {
      expect(datas[i]).toBeGreaterThanOrEqual(datas[i - 1])
    }
  })

  it('cada conversa tem os campos necessários', async () => {
    const res = await request(app)
      .get(`/api/atendimentos/${pacienteId}/conversas`)
      .set('Authorization', `Bearer ${token}`)

    const c = res.body[0]
    expect(c).toHaveProperty('id')
    expect(c).toHaveProperty('mensagem_paciente')
    expect(c).toHaveProperty('mensagem_agente')
    expect(c).toHaveProperty('tipo_remetente')
    expect(c).toHaveProperty('modo_humano')
    expect(c).toHaveProperty('created_at')
  })
})
