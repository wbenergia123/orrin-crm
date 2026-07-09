// tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

beforeAll(async () => {
  const senhaHash = await bcrypt.hash('senha123', 10)
  await supabase
    .from('usuarios')
    .upsert({ email: 'teste@clinica.com', senha_hash: senhaHash, role: 'secretaria' }, { onConflict: 'email' })
})

describe('POST /api/auth/login', () => {
  it('retorna token com credenciais válidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@clinica.com', senha: 'senha123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.usuario.email).toBe('teste@clinica.com')
  })

  it('retorna 401 com senha errada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@clinica.com', senha: 'errada' })
    expect(res.status).toBe(401)
  })

  it('retorna 401 com email inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@clinica.com', senha: 'senha123' })
    expect(res.status).toBe(401)
  })

  it('retorna 401 quando o usuario esta inativo', async () => {
    const senhaHash = await bcrypt.hash('senha123', 10)
    await supabase
      .from('usuarios')
      .upsert({ email: 'inativo@clinica.com', senha_hash: senhaHash, role: 'admin', ativo: false }, { onConflict: 'email' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inativo@clinica.com', senha: 'senha123' })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/inativo|desativado/i)
  })
})

describe('POST /api/auth/login - clínica desativada', () => {
  let orgId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: `auth-test-${Date.now()}`, nome: 'Org Teste Auth', ativo: false })
      .select()
      .single()
    orgId = org!.id

    const senhaHash = await bcrypt.hash('senha123', 10)
    await supabase
      .from('usuarios')
      .upsert(
        { email: 'clinica-desativada@clinica.com', senha_hash: senhaHash, role: 'admin', tenant_id: orgId },
        { onConflict: 'email' }
      )
  })

  afterAll(async () => {
    await supabase.from('usuarios').delete().eq('tenant_id', orgId)
    await supabase.from('organizacoes').delete().eq('id', orgId)
  })

  it('retorna 401 quando a clínica do usuário está desativada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clinica-desativada@clinica.com', senha: 'senha123' })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/clínica|desativad/i)
  })
})

describe('POST /api/auth/login - studio_3d_ativo', () => {
  let orgId: string
  let host: string
  const EMAIL = 'sec_studio3d_auth@clinica.com'

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: `auth-studio3d-${Date.now()}`, nome: 'Org Teste Studio3D', ativo: true, studio_3d_ativo: true })
      .select()
      .single()
    orgId = org!.id
    host = `${org!.slug}.orrin.com.br`

    const senhaHash = await bcrypt.hash('senha123', 10)
    await supabase
      .from('usuarios')
      .upsert(
        { email: EMAIL, senha_hash: senhaHash, role: 'secretaria', tenant_id: orgId },
        { onConflict: 'email' }
      )
  })

  afterAll(async () => {
    await supabase.from('usuarios').delete().eq('tenant_id', orgId)
    await supabase.from('organizacoes').delete().eq('id', orgId)
  })

  it('login retorna studio_3d_ativo da clínica', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Host', host)
      .send({ email: EMAIL, senha: 'senha123' })
    expect(res.status).toBe(200)
    expect(typeof res.body.usuario.studio_3d_ativo).toBe('boolean')
    expect(res.body.usuario.studio_3d_ativo).toBe(true)
  })
})

describe('GET /api/auth/me', () => {
  it('retorna dados do usuário com token válido', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teste@clinica.com', senha: 'senha123' })
    const { token } = loginRes.body

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.usuario.email).toBe('teste@clinica.com')
  })

  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
