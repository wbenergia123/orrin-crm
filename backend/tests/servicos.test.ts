// tests/servicos.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: 'sec2@clinica.com', senha_hash: hash, role: 'secretaria' }, { onConflict: 'email' })
  const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec2@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
})

describe('GET /api/servicos', () => {
  it('retorna lista de serviços ativos', async () => {
    const res = await request(app).get('/api/servicos').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0) // seed data has 4 services
  })
})

describe('POST /api/servicos', () => {
  it('cria serviço com nome e preço', async () => {
    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Harmonização Facial', preco: 2500.00, duracao_minutos: 60 })
    expect(res.status).toBe(201)
    expect(res.body.nome).toBe('Harmonização Facial')
    expect(Number(res.body.preco)).toBe(2500)
    // cleanup — apaga só o registro criado por este teste, nunca por nome (um nome
    // genérico como esse poderia coincidir com um serviço real de outra clínica)
    await supabase.from('servicos').delete().eq('id', res.body.id)
  })

  it('retorna 400 sem nome', async () => {
    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({ preco: 100 })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/servicos/:id', () => {
  it('atualiza preço do serviço', async () => {
    const { data } = await supabase.from('servicos').select('id').eq('nome', 'Botox').single()
    const res = await request(app)
      .patch(`/api/servicos/${data!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ preco: 900 })
    expect(res.status).toBe(200)
    expect(Number(res.body.preco)).toBe(900)
    // restore
    await supabase.from('servicos').update({ preco: 800 }).eq('id', data!.id)
  })
})
