// tests/auth.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
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
