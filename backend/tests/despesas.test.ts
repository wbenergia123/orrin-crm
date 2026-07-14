import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let tenantId: string
let token: string
let host: string
const EMAIL = 'gestor@despesas-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'despesas-test', nome: 'Despesas Test', vertical: 'agro' })
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
  await supabase.from('despesas').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`).set('Host', host)

describe('POST /api/despesas', () => {
  it('cria despesa normalizando categoria', async () => {
    const res = await auth(request(app).post('/api/despesas'))
      .send({ descricao: 'Anúncio Google', categoria: '  ads ', valor: 350.5, data: '2026-07-05' })
    expect(res.status).toBe(201)
    expect(res.body.categoria).toBe('Ads')
  })
  it('400 sem valor', async () => {
    const res = await auth(request(app).post('/api/despesas'))
      .send({ descricao: 'X', categoria: 'Outros', data: '2026-07-05' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/despesas/resumo', () => {
  it('agrupa por categoria no período', async () => {
    await auth(request(app).post('/api/despesas')).send({ descricao: 'Impulsionamento', categoria: 'ADS', valor: 149.5, data: '2026-07-10' })
    await auth(request(app).post('/api/despesas')).send({ descricao: 'Aluguel galpão', categoria: 'Aluguel', valor: 3000, data: '2026-07-01', fixa: true })

    const res = await auth(request(app).get('/api/despesas/resumo?de=2026-07-01&ate=2026-07-31'))
    expect(res.status).toBe(200)
    const ads = res.body.categorias.find((c: { categoria: string }) => c.categoria === 'Ads')
    expect(ads.total).toBe(500)
    expect(res.body.total).toBe(3500)
  })
})

describe('POST /api/despesas/copiar-fixas', () => {
  it('duplica fixas do mês anterior pro mês alvo', async () => {
    const res = await auth(request(app).post('/api/despesas/copiar-fixas')).send({ mes: '2026-08' })
    expect(res.status).toBe(201)
    expect(res.body.copiadas).toBe(1)
    const { data } = await supabase.from('despesas').select('data, descricao').eq('tenant_id', tenantId).eq('data', '2026-08-01')
    expect(data!.length).toBe(1)
    expect(data![0].descricao).toBe('Aluguel galpão')
  })
})

describe('GET /api/despesas/categorias', () => {
  it('retorna categorias distintas', async () => {
    const res = await auth(request(app).get('/api/despesas/categorias'))
    expect(res.status).toBe(200)
    expect(res.body).toContain('Ads')
    expect(res.body).toContain('Aluguel')
  })
})
