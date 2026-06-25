import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

// Fixture isolada (org própria, não reaproveita conta compartilhada) — confirma que
// data_hora é tratado como texto local puro, sem depender do timezone do processo.
describe('data_hora como texto local (sem deslocar fuso)', () => {
  let tzTenantId: string
  let tzToken: string
  let tzHost: string
  let tzPacienteId: string
  let tzServicoId: string
  let tzProfissionalId: string
  let tzAgendamentoId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: 'agendamentos-tz-test', nome: 'Agendamentos TZ Test' })
      .select('id, slug')
      .single()
    tzTenantId = org!.id
    tzHost = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').insert({ email: 'sec_tz_test@clinica.com', senha_hash: hash, role: 'secretaria', tenant_id: tzTenantId })
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec_tz_test@clinica.com', senha: 'senha123' })
    tzToken = loginRes.body.token

    const { data: p } = await supabase.from('pacientes').insert({ tenant_id: tzTenantId, telefone: '5511988880777', nome: 'Paciente TZ' }).select('id').single()
    tzPacienteId = p!.id
    const { data: s } = await supabase.from('servicos').insert({ tenant_id: tzTenantId, nome: 'Serviço TZ', preco: 100, duracao_minutos: 60, ativo: true }).select('id').single()
    tzServicoId = s!.id
    const { data: pr } = await supabase.from('profissionais').insert({ tenant_id: tzTenantId, nome: 'Profissional TZ', ativo: true }).select('id').single()
    tzProfissionalId = pr!.id
  })

  afterAll(async () => {
    if (tzAgendamentoId) await supabase.from('agendamentos').delete().eq('id', tzAgendamentoId)
    await supabase.from('pacientes').delete().eq('id', tzPacienteId)
    await supabase.from('servicos').delete().eq('id', tzServicoId)
    await supabase.from('profissionais').delete().eq('id', tzProfissionalId)
    await supabase.from('usuarios').delete().eq('tenant_id', tzTenantId)
    await supabase.from('organizacoes').delete().eq('id', tzTenantId)
  })

  it('cria às 14h e o slot de 14h aparece ocupado (não 11h)', async () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 10)
    const dataStr = amanha.toISOString().substring(0, 10)

    const criar = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tzToken}`)
      .set('Host', tzHost)
      .send({ paciente_id: tzPacienteId, servico_id: tzServicoId, profissional_id: tzProfissionalId, data_hora: `${dataStr}T14:00:00-03:00` })
    expect(criar.status).toBe(201)
    tzAgendamentoId = criar.body.id

    const { data: salvo } = await supabase.from('agendamentos').select('data_hora').eq('id', tzAgendamentoId).single()
    expect(salvo!.data_hora).toBe(`${dataStr}T14:00:00`)

    const slots = await request(app)
      .get(`/api/agendamentos/slots-disponiveis?data=${dataStr}&profissional_id=${tzProfissionalId}`)
      .set('Authorization', `Bearer ${tzToken}`)
      .set('Host', tzHost)
    const slot14 = slots.body.find((s: { hora: string }) => s.hora === '14:00')
    const slot11 = slots.body.find((s: { hora: string }) => s.hora === '11:00')
    expect(slot14.disponivel).toBe(false)
    expect(slot11.disponivel).toBe(true)
  })
})
