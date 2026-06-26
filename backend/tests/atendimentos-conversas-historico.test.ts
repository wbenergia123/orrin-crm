import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

// Fixture isolada — confirma que GET /:paciente_id/conversas retorna as 100
// mensagens mais RECENTES (não as mais antigas) quando a conversa é longa.
describe('GET /api/atendimentos/:paciente_id/conversas — janela de histórico', () => {
  let tenantId: string
  let token: string
  let host: string
  let pacienteId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: 'atendimentos-historico-test', nome: 'Atendimentos Historico Test' })
      .select('id, slug')
      .single()
    tenantId = org!.id
    host = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').insert({ email: 'sec_atend_historico@clinica.com', senha_hash: hash, role: 'secretaria', tenant_id: tenantId, ativo: true })
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'sec_atend_historico@clinica.com', senha: 'senha123' })
    token = loginRes.body.token

    const { data: p } = await supabase.from('pacientes').insert({ tenant_id: tenantId, telefone: '5511988880555', nome: 'Paciente Historico Longo' }).select('id').single()
    pacienteId = p!.id

    const base = Date.now()
    const linhas = Array.from({ length: 105 }, (_, i) => ({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      mensagem_paciente: `Pergunta ${i + 1}`,
      mensagem_agente: `Resposta ${i + 1}`,
      tipo_remetente: 'agente' as const,
      modo_humano: false,
      created_at: new Date(base + i * 1000).toISOString(),
    }))
    await supabase.from('conversas_pacientes').insert(linhas)
  })

  afterAll(async () => {
    await supabase.from('conversas_pacientes').delete().eq('tenant_id', tenantId)
    await supabase.from('pacientes').delete().eq('id', pacienteId)
    await supabase.from('usuarios').delete().eq('tenant_id', tenantId)
    await supabase.from('organizacoes').delete().eq('id', tenantId)
  })

  it('retorna as 100 mensagens mais recentes, em ordem cronológica', async () => {
    const res = await request(app)
      .get(`/api/atendimentos/${pacienteId}/conversas`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', host)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(100)
    // As 5 primeiras (mais antigas) não devem aparecer — só as 100 últimas
    expect(res.body.map((r: { mensagem_paciente: string }) => r.mensagem_paciente)).not.toContain('Pergunta 1')
    expect(res.body.map((r: { mensagem_paciente: string }) => r.mensagem_paciente)).not.toContain('Pergunta 5')
    // Continua em ordem cronológica (mais antiga primeiro, mais recente por último)
    expect(res.body[0].mensagem_paciente).toBe('Pergunta 6')
    expect(res.body[99].mensagem_paciente).toBe('Pergunta 105')
  })
})
