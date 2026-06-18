// tests/dashboard.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: 'sec4@clinica.com', senha_hash: hash, role: 'secretaria' }, { onConflict: 'email' })
  const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec4@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
})

describe('GET /api/dashboard/metricas', () => {
  it('retorna objeto com 4 métricas numéricas', async () => {
    const res = await request(app)
      .get('/api/dashboard/metricas')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.faturamentoMes).toBe('number')
    expect(typeof res.body.agendamentosMes).toBe('number')
    expect(typeof res.body.leadsNovos).toBe('number')
    expect(typeof res.body.taxaConversao).toBe('number')
    expect(res.body.taxaConversao).toBeGreaterThanOrEqual(0)
    expect(res.body.taxaConversao).toBeLessThanOrEqual(100)
  })
})
