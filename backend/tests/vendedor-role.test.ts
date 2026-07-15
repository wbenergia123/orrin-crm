import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let orgId: string
let orgSlug: string
let host: string
let superToken: string
let vendedorToken: string
let pacienteId: string
const SUPER_EMAIL = 'super.vendedor-test@orrin.com'
const VENDEDOR_EMAIL = 'vendedor@vendedor-role-test.com'

beforeAll(async () => {
  orgSlug = `vendedor-role-test-${Date.now()}`
  const { data: org } = await supabase
    .from('organizacoes').insert({ slug: orgSlug, nome: 'Vendedor Role Test', vertical: 'agro' })
    .select('id, slug').single()
  orgId = org!.id
  host = `${org!.slug}.orrin.com.br`

  const senhaHash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: SUPER_EMAIL, senha_hash: senhaHash, role: 'super_admin', ativo: true },
    { onConflict: 'email' }
  )
  const loginSuper = await request(app).post('/api/auth/login').send({ email: SUPER_EMAIL, senha: 'senha123' })
  superToken = loginSuper.body.token

  await supabase.from('usuarios').insert(
    { email: VENDEDOR_EMAIL, senha_hash: senhaHash, role: 'vendedor', tenant_id: orgId, ativo: true }
  )
  const loginVendedor = await request(app).post('/api/auth/login').send({ email: VENDEDOR_EMAIL, senha: 'senha123' })
  vendedorToken = loginVendedor.body.token

  const { data: p } = await supabase
    .from('pacientes').insert({ tenant_id: orgId, telefone: '5545999991234', nome: 'Lead Vendedor Test' })
    .select('id').single()
  pacienteId = p!.id
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('tenant_id', orgId)
  await supabase.from('usuarios').delete().eq('tenant_id', orgId)
  await supabase.from('usuarios').delete().eq('email', SUPER_EMAIL)
  await supabase.from('organizacoes').delete().eq('id', orgId)
})

const asVendedor = (r: request.Test) => r.set('Authorization', `Bearer ${vendedorToken}`).set('Host', host)

describe('POST /api/admin/tenants/:id/usuarios', () => {
  it('cria usuário vendedor pra uma clínica existente', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${orgId}/usuarios`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'novo.vendedor@vendedor-role-test.com', role: 'vendedor' })
    expect(res.status).toBe(201)
    expect(res.body.role).toBe('vendedor')
    expect(res.body.senha).toBe('senha123')
    await supabase.from('usuarios').delete().eq('email', 'novo.vendedor@vendedor-role-test.com')
  })

  it('rejeita role inválido', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${orgId}/usuarios`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'x@x.com', role: 'gerente' })
    expect(res.status).toBe(400)
  })

  it('rejeita e-mail duplicado', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${orgId}/usuarios`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: VENDEDOR_EMAIL, role: 'vendedor' })
    expect(res.status).toBe(409)
  })
})

describe('vendedor — acesso permitido', () => {
  it('acessa Pipeline (pacientes)', async () => {
    const res = await asVendedor(request(app).get('/api/pacientes'))
    expect(res.status).toBe(200)
  })

  it('acessa Atendimentos', async () => {
    const res = await asVendedor(request(app).get('/api/atendimentos/resumo'))
    expect(res.status).toBe(200)
  })

  it('lê o catálogo de Produtos (GET)', async () => {
    const res = await asVendedor(request(app).get('/api/produtos'))
    expect(res.status).toBe(200)
  })
})

describe('vendedor — acesso bloqueado', () => {
  it('não cria produto (POST)', async () => {
    const res = await asVendedor(request(app).post('/api/produtos')).send({ nome: 'X' })
    expect(res.status).toBe(403)
  })

  it('não acessa Dashboard', async () => {
    const res = await asVendedor(request(app).get('/api/dashboard/metricas'))
    expect(res.status).toBe(403)
  })

  it('não acessa Vendedores (profissionais)', async () => {
    const res = await asVendedor(request(app).get('/api/profissionais'))
    expect(res.status).toBe(403)
  })

  it('não acessa Configurações', async () => {
    const res = await asVendedor(request(app).get('/api/configuracoes'))
    expect(res.status).toBe(403)
  })

  it('não acessa a Agenda (reunioes-agro)', async () => {
    const res = await asVendedor(request(app).get('/api/reunioes-agro'))
    expect(res.status).toBe(403)
  })

  it('não acessa Bloqueios', async () => {
    const res = await asVendedor(request(app).get('/api/bloqueios'))
    expect(res.status).toBe(403)
  })

  it('não acessa Financeiro', async () => {
    const res = await asVendedor(request(app).get('/api/financeiro/resumo'))
    expect(res.status).toBe(403)
  })

  it('não acessa Despesas', async () => {
    const res = await asVendedor(request(app).get('/api/despesas'))
    expect(res.status).toBe(403)
  })
})
