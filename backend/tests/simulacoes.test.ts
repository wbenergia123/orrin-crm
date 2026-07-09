// backend/tests/simulacoes.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'

vi.mock('../src/lib/meshy', () => ({
  criarTask: vi.fn(async () => 'task-mock-123'),
  consultarTask: vi.fn(async () => ({ status: 'IN_PROGRESS', progress: 50 })),
  baixarArquivo: vi.fn(async () => Buffer.from('fake-glb-binario')),
}))

import * as meshy from '../src/lib/meshy'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let host: string
let tenantId: string
let pacienteId: string

const EMAIL = 'sec_studio3d@clinica.com'

beforeAll(async () => {
  // sec2@clinica.com (fixture usada em servicos.test.ts) está com tenant_id null —
  // esse teste antigo já está quebrado por não setar Host (ignorado, ver instruções).
  // Usamos e-mail dedicado e setamos tenant_id explicitamente no upsert, como faz
  // o padrão que funciona em profissionais.test.ts (fixture "Foto do profissional").
  const { data: org } = await supabase
    .from('organizacoes')
    .select('id, slug')
    .eq('ativo', true)
    .limit(1)
    .single()
  tenantId = org!.id
  host = `${org!.slug}.orrin.com.br`

  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: EMAIL, senha_hash: hash, role: 'secretaria', tenant_id: tenantId }, { onConflict: 'email' })
  await supabase.from('organizacoes').update({ studio_3d_ativo: true }).eq('id', tenantId)

  const login = await request(app).post('/api/auth/login').set('Host', host).send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token

  const { data: pac } = await supabase.from('pacientes')
    .insert({ tenant_id: tenantId, nome: 'Paciente Teste Studio3D', telefone: '5511999990000' }).select('id').single()
  pacienteId = pac!.id
})

afterAll(async () => {
  await supabase.from('simulacoes_3d').delete().eq('paciente_id', pacienteId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
})

describe('gate studio_3d_ativo', () => {
  it('retorna 403 quando a clínica não tem o recurso', async () => {
    await supabase.from('organizacoes').update({ studio_3d_ativo: false }).eq('id', tenantId)
    const res = await request(app).get(`/api/simulacoes?paciente_id=${pacienteId}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    await supabase.from('organizacoes').update({ studio_3d_ativo: true }).eq('id', tenantId)
  })
})

describe('GET /api/simulacoes', () => {
  it('lista simulações do paciente (vazio no início)', async () => {
    const res = await request(app).get(`/api/simulacoes?paciente_id=${pacienteId}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('retorna 400 sem paciente_id', async () => {
    const res = await request(app).get('/api/simulacoes')
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})
