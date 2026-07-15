import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'
import { agoraComoTextoLocal } from '../src/lib/datetime-local'

const app = createApp()
let tenantId: string
let token: string
let host: string
const EMAIL = 'gestor@dash-agro-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'dash-agro-test', nome: 'Dash Agro Test', vertical: 'agro' })
    .select('id, slug')
    .single()
  tenantId = org!.id
  host = `${org!.slug}.orrin.com.br`
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )
  const hoje = agoraComoTextoLocal().slice(0, 10)
  await supabase.from('pacientes').insert([
    { tenant_id: tenantId, telefone: '5545999990010', status: 'novo' },
    { tenant_id: tenantId, telefone: '5545999990011', status: 'reuniao_agendada' },
    { tenant_id: tenantId, telefone: '5545999990012', status: 'fechado', valor_fechado: 45000, data_fechamento: hoje },
  ])
  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('GET /api/dashboard/metricas (vertical agro)', () => {
  it('retorna métricas do funil de venda', async () => {
    const res = await request(app).get('/api/dashboard/metricas')
      .set('Authorization', `Bearer ${token}`).set('Host', host)
    expect(res.status).toBe(200)
    expect(res.body.vertical).toBe('agro')
    expect(res.body.leadsNovosMes).toBeGreaterThanOrEqual(3)
    expect(res.body.valorFechadoMes).toBe(45000)
    expect(res.body.negociosFechadosMes).toBe(1)
    expect(typeof res.body.reunioesMes).toBe('number')
  })
})
