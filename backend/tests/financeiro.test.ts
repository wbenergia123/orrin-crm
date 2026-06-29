import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

const PERIODO_INICIO = '2026-06-01'
const PERIODO_FIM = '2026-06-30'

let tenantId: string
let slug: string
let tokenAdmin: string
let tokenSecretaria: string
let servicoAId: string
let servicoBId: string
let profissionalId: string
let pacienteNovoId: string
let pacienteRecorrenteId: string

describe('Financeiro', () => {
  beforeAll(async () => {
    const timestamp = Date.now()
    slug = `financeiro-test-${timestamp}`
    const senhaHash = await bcrypt.hash('senha123', 10)

    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug, nome: 'Financeiro Test' })
      .select('id')
      .single()
    tenantId = org!.id

    await Promise.all([
      supabase.from('usuarios').insert({ email: `fin-admin-${timestamp}@test.com`, senha_hash: senhaHash, role: 'admin', tenant_id: tenantId, ativo: true }),
      supabase.from('usuarios').insert({ email: `fin-sec-${timestamp}@test.com`, senha_hash: senhaHash, role: 'secretaria', tenant_id: tenantId, ativo: true }),
    ])

    const [loginAdmin, loginSecretaria] = await Promise.all([
      request(app).post('/api/auth/login').send({ email: `fin-admin-${timestamp}@test.com`, senha: 'senha123' }),
      request(app).post('/api/auth/login').send({ email: `fin-sec-${timestamp}@test.com`, senha: 'senha123' }),
    ])

    tokenAdmin = loginAdmin.body.token
    tokenSecretaria = loginSecretaria.body.token

    const [{ data: sA }, { data: sB }] = await Promise.all([
      supabase.from('servicos').insert({ tenant_id: tenantId, nome: 'Limpeza de Pele', preco: 200, duracao_minutos: 60, ativo: true }).select('id').single(),
      supabase.from('servicos').insert({ tenant_id: tenantId, nome: 'Botox', preco: 300, duracao_minutos: 30, ativo: true }).select('id').single(),
    ])
    servicoAId = sA!.id
    servicoBId = sB!.id

    const { data: prof } = await supabase
      .from('profissionais')
      .insert({ tenant_id: tenantId, nome: 'Dra. Financeiro', comissao_percentual: 10, ativo: true })
      .select('id')
      .single()
    profissionalId = prof!.id

    const [{ data: pNovo }, { data: pRecorrente }] = await Promise.all([
      supabase.from('pacientes').insert({
        tenant_id: tenantId,
        telefone: '5511999990010',
        nome: 'Paciente Novo',
        status: 'novo',
        created_at: new Date('2026-06-15T12:00:00-03:00').toISOString(),
      }).select('id').single(),
      supabase.from('pacientes').insert({
        tenant_id: tenantId,
        telefone: '5511999990011',
        nome: 'Paciente Recorrente',
        status: 'cliente',
        created_at: new Date('2026-05-15T12:00:00-03:00').toISOString(),
      }).select('id').single(),
    ])
    pacienteNovoId = pNovo!.id
    pacienteRecorrenteId = pRecorrente!.id

    // Período atual: 2 concluídos, 1 cancelado, 1 agendado
    await supabase.from('agendamentos').insert([
      { tenant_id: tenantId, paciente_id: pacienteRecorrenteId, servico_id: servicoAId, profissional_id: profissionalId, data_hora: '2026-06-10T10:00:00', status: 'concluido' },
      { tenant_id: tenantId, paciente_id: pacienteNovoId, servico_id: servicoBId, profissional_id: profissionalId, data_hora: '2026-06-12T11:00:00', status: 'concluido' },
      { tenant_id: tenantId, paciente_id: pacienteNovoId, servico_id: servicoAId, profissional_id: profissionalId, data_hora: '2026-06-14T14:00:00', status: 'cancelado' },
      { tenant_id: tenantId, paciente_id: pacienteRecorrenteId, servico_id: servicoBId, profissional_id: profissionalId, data_hora: '2026-06-20T09:00:00', status: 'agendado' },
    ])

    // Período anterior: 1 concluído
    await supabase.from('agendamentos').insert([
      { tenant_id: tenantId, paciente_id: pacienteRecorrenteId, servico_id: servicoAId, profissional_id: profissionalId, data_hora: '2026-05-10T10:00:00', status: 'concluido' },
    ])
  })

  afterAll(async () => {
    await supabase.from('agendamentos').delete().eq('tenant_id', tenantId)
    await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
    await supabase.from('profissionais').delete().eq('tenant_id', tenantId)
    await supabase.from('servicos').delete().eq('tenant_id', tenantId)
    await supabase.from('usuarios').delete().eq('tenant_id', tenantId)
    await supabase.from('organizacoes').delete().eq('id', tenantId)
  })

  describe('GET /api/financeiro/resumo', () => {
    it('retorna resumo correto do período', async () => {
      const res = await request(app)
        .get(`/api/financeiro/resumo?inicio=${PERIODO_INICIO}&fim=${PERIODO_FIM}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('Host', `${slug}.orrin.com.br`)

      expect(res.status).toBe(200)
      expect(res.body.faturamento).toBe(500)
      expect(res.body.agendamentosConcluidos).toBe(2)
      expect(res.body.agendamentosCancelados).toBe(1)
      expect(res.body.taxaCancelamento).toBe(33)
      expect(res.body.clientesNovos).toBe(1)
      expect(res.body.clientesRecorrentes).toBe(1)
      expect(res.body.ticketMedio).toBe(250)
      expect(res.body.deltas.faturamento).toBe(150) // (500 - 200) / 200 = 150% (período anterior teve 1 concluído de Limpeza de Pele, preço 200)
      expect(res.body.deltas.agendamentosConcluidos).toBe(100) // (2 - 1) / 1 = 100%
    })
  })

  describe('GET /api/financeiro/por-procedimento', () => {
    it('retorna procedimentos ordenados por receita', async () => {
      const res = await request(app)
        .get(`/api/financeiro/por-procedimento?inicio=${PERIODO_INICIO}&fim=${PERIODO_FIM}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('Host', `${slug}.orrin.com.br`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].nome).toBe('Botox')
      expect(res.body[0].quantidade).toBe(1)
      expect(res.body[0].receita).toBe(300)
      expect(res.body[1].nome).toBe('Limpeza de Pele')
      expect(res.body[1].quantidade).toBe(1)
      expect(res.body[1].receita).toBe(200)
    })
  })

  describe('GET /api/financeiro/por-profissional', () => {
    it('retorna profissional com comissão estimada', async () => {
      const res = await request(app)
        .get(`/api/financeiro/por-profissional?inicio=${PERIODO_INICIO}&fim=${PERIODO_FIM}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('Host', `${slug}.orrin.com.br`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].nome).toBe('Dra. Financeiro')
      expect(res.body[0].atendimentos).toBe(2)
      expect(res.body[0].receita).toBe(500)
      expect(res.body[0].comissao_percentual).toBe(10)
      expect(res.body[0].comissao_estimada).toBe(50)
    })
  })

  describe('Permissões', () => {
    it('secretaria recebe 403', async () => {
      const res = await request(app)
        .get(`/api/financeiro/resumo?inicio=${PERIODO_INICIO}&fim=${PERIODO_FIM}`)
        .set('Authorization', `Bearer ${tokenSecretaria}`)
        .set('Host', `${slug}.orrin.com.br`)

      expect(res.status).toBe(403)
    })
  })
})
