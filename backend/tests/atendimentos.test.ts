import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let pacienteId: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: 'sec_atend@clinica.com', senha_hash: hash, role: 'secretaria' },
    { onConflict: 'email' }
  )
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sec_atend@clinica.com', senha: 'senha123' })
  token = loginRes.body.token

  const { data: p } = await supabase
    .from('pacientes')
    .upsert({ telefone: '5511977770001', nome: 'Paciente Atend Test' }, { onConflict: 'telefone' })
    .select('id')
    .single()
  pacienteId = p!.id
})

afterAll(async () => {
  await supabase.from('conversas').delete().eq('paciente_id', pacienteId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('POST /api/atendimentos/:paciente_id/mensagem', () => {
  it('retorna 404 para paciente inexistente', async () => {
    const res = await request(app)
      .post('/api/atendimentos/00000000-0000-0000-0000-000000000000/mensagem')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'Olá!' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Paciente não encontrado')
  })

  it('retorna 400 se paciente não está em modo humano', async () => {
    const res = await request(app)
      .post(`/api/atendimentos/${pacienteId}/mensagem`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'Olá, como posso ajudar?' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Paciente não está em modo humano')
  })

  it('retorna 400 se texto está vazio', async () => {
    const res = await request(app)
      .post(`/api/atendimentos/${pacienteId}/mensagem`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('texto é obrigatório')
  })

  it('salva mensagem e retorna 201 quando em modo humano', async () => {
    // Ativa modo humano antes deste teste
    await request(app)
      .patch(`/api/atendimentos/${pacienteId}/handoff`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modo_humano: true })

    const res = await request(app)
      .post(`/api/atendimentos/${pacienteId}/mensagem`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'Olá, vou verificar sua consulta!' })

    expect(res.status).toBe(201)
    expect(res.body.mensagem_agente).toBe('Olá, vou verificar sua consulta!')
    expect(res.body.tipo_remetente).toBe('humano')
    expect(res.body.modo_humano).toBe(true)
  })
})
