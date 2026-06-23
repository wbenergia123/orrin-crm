import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

describe('Marcação Digital', () => {
  const email = 'sec_marcacao@clinica.com'
  let token: string
  let hostTenant: string
  let tenantId: string
  let pacienteId: string

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

    const { data: paciente } = await supabase
      .from('pacientes')
      .insert({ tenant_id: tenantId, telefone: `551199${Date.now()}`, nome: 'Paciente Marcação Teste', status: 'novo' })
      .select('id')
      .single()
    pacienteId = paciente!.id
  })

  afterAll(async () => {
    await supabase.from('atendimentos').delete().eq('paciente_id', pacienteId)
    await supabase.from('pacientes').delete().eq('id', pacienteId)
  })

  describe('POST /api/marcacoes/atendimentos', () => {
    it('cria uma sessão para um paciente real', async () => {
      const res = await request(app)
        .post('/api/marcacoes/atendimentos')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .send({ paciente_id: pacienteId })
      expect(res.status).toBe(201)
      expect(res.body.paciente_id).toBe(pacienteId)
    })
  })
})
