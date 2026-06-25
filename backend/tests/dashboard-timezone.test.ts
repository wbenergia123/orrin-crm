import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'
import { agoraComoTextoLocal } from '../src/lib/datetime-local'

const app = createApp()

// Fixture isolada — confirma que um agendamento marcado "agora" (horário de
// Brasília) entra na métrica do mês atual, mesmo perto da virada UTC/BRT.
describe('GET /api/dashboard/metricas - limites do mês no calendário de Brasília', () => {
  let tenantId: string
  let token: string
  let host: string
  let pacienteId: string
  let servicoId: string
  let profissionalId: string
  let agendamentoId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: 'dashboard-tz-test', nome: 'Dashboard TZ Test' })
      .select('id, slug')
      .single()
    tenantId = org!.id
    host = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').insert({ email: 'sec_dashboard_tz@clinica.com', senha_hash: hash, role: 'secretaria', tenant_id: tenantId })
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec_dashboard_tz@clinica.com', senha: 'senha123' })
    token = loginRes.body.token

    const { data: p } = await supabase.from('pacientes').insert({ tenant_id: tenantId, telefone: '5511988880888', nome: 'Paciente Dashboard TZ' }).select('id').single()
    pacienteId = p!.id
    const { data: s } = await supabase.from('servicos').insert({ tenant_id: tenantId, nome: 'Serviço Dashboard TZ', preco: 150, duracao_minutos: 60, ativo: true }).select('id').single()
    servicoId = s!.id
    const { data: pr } = await supabase.from('profissionais').insert({ tenant_id: tenantId, nome: 'Profissional Dashboard TZ', ativo: true }).select('id').single()
    profissionalId = pr!.id

    const { data: ag } = await supabase
      .from('agendamentos')
      .insert({ tenant_id: tenantId, paciente_id: pacienteId, servico_id: servicoId, profissional_id: profissionalId, data_hora: agoraComoTextoLocal(), status: 'confirmado' })
      .select('id')
      .single()
    agendamentoId = ag!.id
  })

  afterAll(async () => {
    await supabase.from('agendamentos').delete().eq('id', agendamentoId)
    await supabase.from('pacientes').delete().eq('id', pacienteId)
    await supabase.from('servicos').delete().eq('id', servicoId)
    await supabase.from('profissionais').delete().eq('id', profissionalId)
    await supabase.from('usuarios').delete().eq('tenant_id', tenantId)
    await supabase.from('organizacoes').delete().eq('id', tenantId)
  })

  it('conta o agendamento de agora no mês atual', async () => {
    const res = await request(app)
      .get('/api/dashboard/metricas')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', host)
    expect(res.status).toBe(200)
    expect(res.body.agendamentosMes).toBe(1)
  })
})
