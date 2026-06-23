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

  describe('POST /api/marcacoes/fotos/upload', () => {
    let visitId: string

    beforeAll(async () => {
      const { data: visit } = await supabase
        .from('atendimentos')
        .insert({ tenant_id: tenantId, paciente_id: pacienteId })
        .select('id')
        .single()
      visitId = visit!.id
    })

    afterAll(async () => {
      await supabase.from('fotos_paciente').delete().eq('paciente_id', pacienteId)
    })

    it('envia uma foto e retorna visit_id e tipo preenchidos', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .field('tipo', 'antes')
        .field('visit_id', visitId)
        .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
      expect(res.body.visit_id).toBe(visitId)
      expect(res.body.tipo).toBe('antes')
      expect(res.body.url).toContain('fotos-pacientes')
    })

    it('envia uma foto sem visit_id (foto solta, sem sessão)', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
      expect(res.body.visit_id).toBeNull()
      expect(res.body.tipo).toBe('geral')
    })

    it('retorna 400 sem arquivo', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
      expect(res.status).toBe(400)
    })

    it('retorna 400 com mimetype inválido', async () => {
      const res = await request(app)
        .post('/api/marcacoes/fotos/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', hostTenant)
        .field('paciente_id', pacienteId)
        .attach('foto', Buffer.from('texto qualquer'), { filename: 'teste.txt', contentType: 'text/plain' })
      expect(res.status).toBe(400)
    })
  })
})
