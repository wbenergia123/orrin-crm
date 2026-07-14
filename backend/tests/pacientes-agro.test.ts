import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let tenantId: string
let token: string
let host: string
const EMAIL = 'gestor@pacientes-agro-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'pacientes-agro-test', nome: 'Pacientes Agro Test', vertical: 'agro' })
    .select('id, slug')
    .single()
  tenantId = org!.id
  host = `${org!.slug}.orrin.com.br`
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )
  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('statuses agro em /pacientes', () => {
  it('aceita PATCH /:id/status com status do funil agro', async () => {
    const { data: p } = await supabase
      .from('pacientes')
      .insert({ tenant_id: tenantId, telefone: '5545999990001', nome: 'Lead Agro Status' })
      .select('id')
      .single()
    const res = await request(app)
      .patch(`/api/pacientes/${p!.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', host)
      .send({ status: 'orcamento_enviado' })
    expect(res.status).toBe(200)
  })

  it('aceita criar paciente com status agro', async () => {
    const res = await request(app)
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', host)
      .send({ telefone: '5545999990009', nome: 'Lead Negociacao', status: 'negociacao' })
    expect(res.status).toBe(201)
  })
})

describe('PATCH /pacientes/:id campos agro', () => {
  it('aceita valor_fechado e data_fechamento', async () => {
    const { data: p } = await supabase.from('pacientes')
      .insert({ tenant_id: tenantId, telefone: '5545999990055' }).select('id').single()
    const res = await request(app)
      .patch(`/api/pacientes/${p!.id}`)
      .set('Authorization', `Bearer ${token}`).set('Host', host)
      .send({ valor_fechado: 45000, data_fechamento: '2026-07-14' })
    expect(res.status).toBe(200)
    await supabase.from('pacientes').delete().eq('id', p!.id)
  })
  it('aceita cidade, atividade, maquinas, produto_interesse_id null', async () => {
    const { data: p } = await supabase.from('pacientes')
      .insert({ tenant_id: tenantId, telefone: '5545999990056' }).select('id').single()
    const res = await request(app)
      .patch(`/api/pacientes/${p!.id}`)
      .set('Authorization', `Bearer ${token}`).set('Host', host)
      .send({ cidade: 'Cascavel', atividade: 'soja', maquinas: 'John Deere 6110J', produto_interesse_id: null })
    expect(res.status).toBe(200)
    await supabase.from('pacientes').delete().eq('id', p!.id)
  })
})
