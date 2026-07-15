import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'
import { getVerticalDoTenant, invalidarCacheVertical } from '../src/lib/vertical'

const app = createApp()
let tenantId: string
const EMAIL = 'gestor@agro-vertical-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'agro-vertical-test', nome: 'Agro Vertical Test', vertical: 'agro' })
    .select('id')
    .single()
  tenantId = org!.id
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )
})

afterAll(async () => {
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
  invalidarCacheVertical(tenantId)
})

describe('getVerticalDoTenant', () => {
  it('retorna agro para org agro e cacheia', async () => {
    expect(await getVerticalDoTenant(tenantId)).toBe('agro')
    expect(await getVerticalDoTenant(tenantId)).toBe('agro')
  })
})

describe('POST /api/auth/login', () => {
  it('retorna vertical no usuario', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, senha: 'senha123' })
    expect(res.status).toBe(200)
    expect(res.body.usuario.vertical).toBe('agro')
  })
})
