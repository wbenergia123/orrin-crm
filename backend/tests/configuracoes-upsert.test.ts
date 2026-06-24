import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

describe('PATCH /api/configuracoes/:chave - salva a mesma chave mais de uma vez', () => {
  const email = 'sec_config_upsert@clinica.com'
  let token: string
  let hostTenant: string
  let tenantId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .select('id, slug')
      .eq('ativo', true)
      .limit(1)
      .single()
    tenantId = org!.id
    hostTenant = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').upsert(
      { email, senha_hash: hash, role: 'secretaria', tenant_id: tenantId },
      { onConflict: 'email' }
    )
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' })
    token = loginRes.body.token
  })

  afterAll(async () => {
    await supabase.from('configuracoes').delete().eq('tenant_id', tenantId).eq('chave', 'teste_upsert')
  })

  it('não falha ao salvar a mesma chave duas vezes seguidas', async () => {
    const primeira = await request(app)
      .patch('/api/configuracoes/teste_upsert')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', hostTenant)
      .send({ valor: 'primeiro valor' })
    expect(primeira.status).toBe(200)
    expect(primeira.body.valor).toBe('primeiro valor')

    const segunda = await request(app)
      .patch('/api/configuracoes/teste_upsert')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', hostTenant)
      .send({ valor: 'segundo valor' })
    expect(segunda.status).toBe(200)
    expect(segunda.body.valor).toBe('segundo valor')

    const { data, count } = await supabase
      .from('configuracoes')
      .select('valor', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('chave', 'teste_upsert')
    expect(count).toBe(1)
    expect(data?.[0].valor).toBe('segundo valor')
  })
})
