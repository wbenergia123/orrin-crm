import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let superToken: string
let testOrgId: string

beforeAll(async () => {
  const senhaHash = await bcrypt.hash('senha123', 10)

  await supabase
    .from('usuarios')
    .upsert({ email: 'super.teste@orrin.com', senha_hash: senhaHash, role: 'super_admin', ativo: true }, { onConflict: 'email' })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'super.teste@orrin.com', senha: 'senha123' })
  superToken = login.body.token

  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'clinica-cancel-test', nome: 'Clínica Cancel Test' })
    .select('id')
    .single()
  testOrgId = org!.id

  await supabase
    .from('usuarios')
    .upsert({ email: 'admin.cancel@test.com', senha_hash: senhaHash, role: 'admin', tenant_id: testOrgId, ativo: true }, { onConflict: 'email' })
})

afterAll(async () => {
  await supabase.from('usuarios').delete().eq('email', 'admin.cancel@test.com')
  await supabase.from('usuarios').delete().eq('email', 'super.teste@orrin.com')
  await supabase.from('organizacoes').delete().eq('id', testOrgId)
})

describe('POST /api/admin/tenants/:id/cancel', () => {
  it('desativa a organizacao e os usuarios dela', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${testOrgId}/cancel`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)

    const { data: org } = await supabase
      .from('organizacoes')
      .select('ativo, deleted_at')
      .eq('id', testOrgId)
      .single()
    expect(org?.ativo).toBe(false)
    expect(org?.deleted_at).not.toBeNull()

    const { data: user } = await supabase
      .from('usuarios')
      .select('ativo')
      .eq('email', 'admin.cancel@test.com')
      .single()
    expect(user?.ativo).toBe(false)
  })

  it('retorna 403 para usuario nao super_admin', async () => {
    const senhaHash = await bcrypt.hash('senha123', 10)
    await supabase
      .from('usuarios')
      .upsert({ email: 'admin.teste@orrin.com', senha_hash: senhaHash, role: 'admin', ativo: true }, { onConflict: 'email' })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.teste@orrin.com', senha: 'senha123' })

    const res = await request(app)
      .post(`/api/admin/tenants/${testOrgId}/cancel`)
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(403)

    await supabase.from('usuarios').delete().eq('email', 'admin.teste@orrin.com')
  })
})
