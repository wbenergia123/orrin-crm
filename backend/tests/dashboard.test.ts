// tests/dashboard.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: 'sec4@clinica.com', senha_hash: hash, role: 'secretaria' }, { onConflict: 'email' })
  const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec4@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
})

describe('GET /api/dashboard/metricas', () => {
  it('retorna objeto com 4 métricas numéricas', async () => {
    const res = await request(app)
      .get('/api/dashboard/metricas')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.faturamentoMes).toBe('number')
    expect(typeof res.body.agendamentosMes).toBe('number')
    expect(typeof res.body.leadsNovos).toBe('number')
    expect(typeof res.body.taxaConversao).toBe('number')
    expect(res.body.taxaConversao).toBeGreaterThanOrEqual(0)
    expect(res.body.taxaConversao).toBeLessThanOrEqual(100)
  })

  it('soma o preço do serviço de um agendamento concluído no faturamentoMes', async () => {
    const timestamp = Date.now()
    const slug = `dash-fat-test-${timestamp}`
    const senhaHash = await bcrypt.hash('senha123', 10)

    const { data: org } = await supabase.from('organizacoes').insert({ slug, nome: 'Dash Fat Test' }).select('id').single()
    const tenantId = org!.id

    await supabase.from('usuarios').insert({ email: `dash-admin-${timestamp}@test.com`, senha_hash: senhaHash, role: 'admin', tenant_id: tenantId, ativo: true })
    const login = await request(app).post('/api/auth/login').send({ email: `dash-admin-${timestamp}@test.com`, senha: 'senha123' })
    const tokenAdmin = login.body.token

    const { data: servico } = await supabase.from('servicos').insert({ tenant_id: tenantId, nome: 'Serviço Teste', preco: 180, duracao_minutos: 30, ativo: true }).select('id').single()
    const { data: prof } = await supabase.from('profissionais').insert({ tenant_id: tenantId, nome: 'Prof Teste', ativo: true }).select('id').single()
    const { data: paciente } = await supabase.from('pacientes').insert({ tenant_id: tenantId, telefone: '5511999990099', status: 'cliente' }).select('id').single()

    const hoje = new Date()
    const dataHora = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-15T10:00:00`
    await supabase.from('agendamentos').insert({
      tenant_id: tenantId, paciente_id: paciente!.id, servico_id: servico!.id, profissional_id: prof!.id,
      data_hora: dataHora, status: 'concluido',
    })

    const res = await request(app)
      .get('/api/dashboard/metricas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Host', `${slug}.orrin.com.br`)

    expect(res.status).toBe(200)
    expect(res.body.faturamentoMes).toBe(180)

    await supabase.from('agendamentos').delete().eq('tenant_id', tenantId)
    await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
    await supabase.from('profissionais').delete().eq('tenant_id', tenantId)
    await supabase.from('servicos').delete().eq('tenant_id', tenantId)
    await supabase.from('usuarios').delete().eq('tenant_id', tenantId)
    await supabase.from('organizacoes').delete().eq('id', tenantId)
  })
})
