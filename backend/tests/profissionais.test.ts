import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let profissionalId: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: 'sec_prof@clinica.com', senha_hash: hash, role: 'secretaria' },
    { onConflict: 'email' }
  )
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sec_prof@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
})

afterAll(async () => {
  if (profissionalId) {
    await supabase.from('profissionais').delete().eq('id', profissionalId)
  }
})

describe('GET /api/profissionais', () => {
  it('retorna lista de profissionais', async () => {
    const res = await request(app)
      .get('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filtra profissionais ativos com ?ativo=true', async () => {
    const res = await request(app)
      .get('/api/profissionais?ativo=true')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.every((p: { ativo: boolean }) => p.ativo)).toBe(true)
  })
})

describe('POST /api/profissionais', () => {
  it('cria profissional com nome válido', async () => {
    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Dra. Teste Silva' })
    expect(res.status).toBe(201)
    expect(res.body.nome).toBe('Dra. Teste Silva')
    expect(res.body.ativo).toBe(true)
    profissionalId = res.body.id
  })

  it('retorna 400 com nome muito curto', async () => {
    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'A' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/profissionais/:id', () => {
  it('atualiza ativo para false', async () => {
    const res = await request(app)
      .patch(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ativo: false })
    expect(res.status).toBe(200)
    expect(res.body.ativo).toBe(false)
  })
})

describe('DELETE /api/profissionais/:id', () => {
  it('desativa profissional (soft delete)', async () => {
    const res = await request(app)
      .delete(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(204)

    // Verifica que o registro foi realmente desativado no banco
    const { data } = await supabase
      .from('profissionais')
      .select('ativo')
      .eq('id', profissionalId)
      .single()
    expect(data?.ativo).toBe(false)
  })
})
