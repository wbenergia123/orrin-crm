import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let profissionalId: string

beforeAll(async () => {
  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: 'sec_prof@clinica.com', senha_hash: hash, role: 'secretaria' },
    { onConflict: 'email' }
  )
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sec_prof@clinica.com', senha: 'senha123' })
  token = loginRes.body.token
})

afterAll(async () => {
  if (profissionalId) {
    await supabase.from('profissionais').delete().eq('id', profissionalId)
  }
})

describe('GET /api/profissionais', () => {
  it('retorna lista de profissionais', async () => {
    const res = await request(app)
      .get('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filtra profissionais ativos com ?ativo=true', async () => {
    const res = await request(app)
      .get('/api/profissionais?ativo=true')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.every((p: { ativo: boolean }) => p.ativo)).toBe(true)
  })
})

describe('POST /api/profissionais', () => {
  it('cria profissional com nome válido', async () => {
    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Dra. Teste Silva' })
    expect(res.status).toBe(201)
    expect(res.body.nome).toBe('Dra. Teste Silva')
    expect(res.body.ativo).toBe(true)
    profissionalId = res.body.id
  })

  it('retorna 400 com nome muito curto', async () => {
    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'A' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/profissionais/:id', () => {
  it('atualiza ativo para false', async () => {
    const res = await request(app)
      .patch(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ativo: false })
    expect(res.status).toBe(200)
    expect(res.body.ativo).toBe(false)
  })

  it('atualiza comissao_percentual', async () => {
    const res = await request(app)
      .patch(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comissao_percentual: 15 })
    expect(res.status).toBe(200)
    expect(res.body.comissao_percentual).toBe(15)
  })

  it('rejeita comissao_percentual maior que 100', async () => {
    const res = await request(app)
      .patch(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comissao_percentual: 150 })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/profissionais/:id', () => {
  it('desativa profissional (soft delete)', async () => {
    const res = await request(app)
      .delete(`/api/profissionais/${profissionalId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(204)

    // Verifica que o registro foi realmente desativado no banco
    const { data } = await supabase
      .from('profissionais')
      .select('ativo')
      .eq('id', profissionalId)
      .single()
    expect(data?.ativo).toBe(false)
  })
})

describe('Foto do profissional', () => {
  const email = 'sec_foto@clinica.com'
  let tokenFoto: string
  let hostTenant: string
  let fotoProfissionalId: string

  beforeAll(async () => {
    const { data: org } = await supabase
      .from('organizacoes')
      .select('id, slug')
      .eq('ativo', true)
      .limit(1)
      .single()
    hostTenant = `${org!.slug}.orrin.com.br`

    const hash = await bcrypt.hash('senha123', 10)
    await supabase.from('usuarios').upsert(
      { email, senha_hash: hash, role: 'secretaria', tenant_id: org!.id },
      { onConflict: 'email' }
    )
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' })
    tokenFoto = loginRes.body.token

    const { data: prof } = await supabase
      .from('profissionais')
      .insert({ nome: 'Foto Teste', tenant_id: org!.id })
      .select()
      .single()
    fotoProfissionalId = prof!.id
  })

  afterAll(async () => {
    await supabase.from('profissionais').delete().eq('id', fotoProfissionalId)
  })

  it('envia uma foto e retorna foto_url preenchido', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(200)
    expect(res.body.foto_url).toContain('fotos-profissionais')
  })

  it('retorna 400 sem arquivo', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
    expect(res.status).toBe(400)
  })

  it('retorna 400 com mimetype inválido', async () => {
    const res = await request(app)
      .post(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from('conteudo qualquer'), { filename: 'teste.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
  })

  it('retorna 404 com id inexistente', async () => {
    const res = await request(app)
      .post('/api/profissionais/00000000-0000-0000-0000-000000000000/foto')
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'teste.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(404)
  })

  it('remove a foto e volta foto_url para null', async () => {
    const res = await request(app)
      .delete(`/api/profissionais/${fotoProfissionalId}/foto`)
      .set('Authorization', `Bearer ${tokenFoto}`)
      .set('Host', hostTenant)
    expect(res.status).toBe(200)
    expect(res.body.foto_url).toBeNull()
  })
})
