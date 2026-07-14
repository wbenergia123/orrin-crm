import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let tenantId: string
let token: string
let host: string
const EMAIL = 'gestor@fin-agro-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'fin-agro-test', nome: 'Fin Agro Test', vertical: 'agro' })
    .select('id, slug')
    .single()
  tenantId = org!.id
  host = `${org!.slug}.orrin.com.br`
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )
  await supabase.from('pacientes').insert([
    { tenant_id: tenantId, telefone: '5545999990020', nome: 'Comprador A', status: 'fechado', valor_fechado: 30000, data_fechamento: '2026-07-10' },
    { tenant_id: tenantId, telefone: '5545999990021', nome: 'Comprador B', status: 'fechado', valor_fechado: 20000, data_fechamento: '2026-07-12' },
  ])
  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('GET /api/financeiro/agro', () => {
  it('retorna receitas do período com lista de fechamentos', async () => {
    const res = await request(app)
      .get('/api/financeiro/agro?inicio=2026-07-01&fim=2026-07-31')
      .set('Authorization', `Bearer ${token}`).set('Host', host)
    expect(res.status).toBe(200)
    expect(res.body.totalReceitas).toBe(50000)
    expect(res.body.fechamentos.length).toBe(2)
    expect(res.body.fechamentos[0]).toHaveProperty('nome')
    expect(res.body.fechamentos[0]).toHaveProperty('valor_fechado')
  })
})
