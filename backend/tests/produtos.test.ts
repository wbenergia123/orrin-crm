import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let tenantId: string
let token: string
let host: string
const EMAIL = 'gestor@produtos-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'produtos-test', nome: 'Produtos Test', vertical: 'agro' })
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
  await supabase.from('produtos').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('POST /api/produtos', () => {
  it('cria produto', async () => {
    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token}`).set('Host', host)
      .send({ nome: 'Plaina Traseira PT-2400', categoria: 'Plainas', descricao: 'Plaina 2,4m' })
    expect(res.status).toBe(201)
    expect(res.body.nome).toBe('Plaina Traseira PT-2400')
    expect(res.body.tenant_id).toBe(tenantId)
  })
  it('400 sem nome', async () => {
    const res = await request(app).post('/api/produtos')
      .set('Authorization', `Bearer ${token}`).set('Host', host).send({ categoria: 'X' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/produtos', () => {
  it('lista produtos do tenant', async () => {
    const res = await request(app).get('/api/produtos')
      .set('Authorization', `Bearer ${token}`).set('Host', host)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
  })
})

describe('PATCH e DELETE /api/produtos/:id', () => {
  it('atualiza e desativa', async () => {
    const { data: prod } = await supabase.from('produtos').select('id').eq('tenant_id', tenantId).single()
    const patch = await request(app).patch(`/api/produtos/${prod!.id}`)
      .set('Authorization', `Bearer ${token}`).set('Host', host).send({ categoria: 'Implementos' })
    expect(patch.status).toBe(200)
    expect(patch.body.categoria).toBe('Implementos')

    const del = await request(app).delete(`/api/produtos/${prod!.id}`)
      .set('Authorization', `Bearer ${token}`).set('Host', host)
    expect(del.status).toBe(200)
    const { data: depois } = await supabase.from('produtos').select('ativo').eq('id', prod!.id).single()
    expect(depois!.ativo).toBe(false)
  })
})
