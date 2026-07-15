import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let superToken: string
const SUPER_EMAIL = 'super.agro-vertical@orrin.com'

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: SUPER_EMAIL, senha_hash: hash, role: 'super_admin', ativo: true },
    { onConflict: 'email' }
  )
  const login = await request(app).post('/api/auth/login').send({ email: SUPER_EMAIL, senha: 'senha123' })
  superToken = login.body.token
})

afterAll(async () => {
  await supabase.from('usuarios').delete().eq('email', SUPER_EMAIL)
})

describe('vertical do tenant no admin', () => {
  it('cria tenant agro e lista com vertical', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ slug: 'agro-admin-test', nome: 'Agro Admin Test', admin_email: 'adm@agro-admin-test.com', vertical: 'agro' })
    expect(res.status).toBe(201)
    expect(res.body.org.vertical).toBe('agro')

    const lista = await request(app).get('/api/admin/tenants').set('Authorization', `Bearer ${superToken}`)
    const criado = lista.body.find((t: { slug: string }) => t.slug === 'agro-admin-test')
    expect(criado.vertical).toBe('agro')

    await supabase.from('usuarios').delete().eq('email', 'adm@agro-admin-test.com')
    await supabase.from('organizacoes').delete().eq('id', res.body.org.id)
  })

  it('rejeita vertical inválido', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ slug: 'agro-inv-test', nome: 'X', admin_email: 'x@inv.com', vertical: 'padaria' })
    expect(res.status).toBe(400)
  })
})
