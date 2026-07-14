import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let tenantId: string
let token: string
let host: string
let pacienteId: string
let vendedorId: string
const EMAIL = 'gestor@reunioes-agro-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'reunioes-agro-test', nome: 'Reunioes Agro Test', vertical: 'agro' })
    .select('id, slug')
    .single()
  tenantId = org!.id
  host = `${org!.slug}.orrin.com.br`
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )
  const { data: p } = await supabase.from('pacientes')
    .insert({ tenant_id: tenantId, telefone: '5545999990002', nome: 'Produtor Teste', status: 'em_conversa' })
    .select('id').single()
  pacienteId = p!.id
  const { data: v } = await supabase.from('profissionais')
    .insert({ tenant_id: tenantId, nome: 'Vendedor João', ativo: true })
    .select('id').single()
  vendedorId = v!.id
  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token
})

afterAll(async () => {
  await supabase.from('reunioes_agro').delete().eq('tenant_id', tenantId)
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('profissionais').delete().eq('tenant_id', tenantId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`).set('Host', host)

describe('POST /api/reunioes-agro', () => {
  it('rejeita virtual sem link', async () => {
    const res = await auth(request(app).post('/api/reunioes-agro'))
      .send({ paciente_id: pacienteId, profissional_id: vendedorId, data_hora: '2026-07-20T14:00:00', tipo: 'virtual' })
    expect(res.status).toBe(400)
  })
  it('cria reunião e move paciente pra reuniao_agendada', async () => {
    const res = await auth(request(app).post('/api/reunioes-agro'))
      .send({ paciente_id: pacienteId, profissional_id: vendedorId, data_hora: '2026-07-20T14:00:00', tipo: 'virtual', link_reuniao: 'https://meet.google.com/abc-defg-hij' })
    expect(res.status).toBe(201)
    expect(res.body.tipo).toBe('virtual')
    const { data: p } = await supabase.from('pacientes').select('status').eq('id', pacienteId).single()
    expect(p!.status).toBe('reuniao_agendada')
  })
})

describe('GET /api/reunioes-agro', () => {
  it('lista com dados do paciente e vendedor', async () => {
    const res = await auth(request(app).get('/api/reunioes-agro?de=2026-07-01&ate=2026-07-31'))
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].pacientes.nome).toBe('Produtor Teste')
    expect(res.body[0].profissionais.nome).toBe('Vendedor João')
  })
})

describe('PATCH /api/reunioes-agro/:id', () => {
  it('atualiza status', async () => {
    const { data: r } = await supabase.from('reunioes_agro').select('id').eq('tenant_id', tenantId).single()
    const res = await auth(request(app).patch(`/api/reunioes-agro/${r!.id}`)).send({ status: 'confirmada' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmada')
  })
})

describe('POST /api/reunioes-agro (campos null do modal)', () => {
  it('cria presencial com local/notas null e sem vendedor (como o modal envia)', async () => {
    const res = await auth(request(app).post('/api/reunioes-agro'))
      .send({ paciente_id: pacienteId, profissional_id: null, data_hora: '2026-07-25T10:00:00', tipo: 'presencial', link_reuniao: null, local: null, notas: null })
    expect(res.status).toBe(201)
    expect(res.body.tipo).toBe('presencial')
  })
})
