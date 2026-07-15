import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let superToken: string
let testOrgId: string

beforeAll(async () => {
  const senhaHash = await bcrypt.hash('senha123', 10)

  await supabase
    .from('usuarios')
    .upsert({ email: 'super.teste@orrin.com', senha_hash: senhaHash, role: 'super_admin', ativo: true }, { onConflict: 'email' })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'super.teste@orrin.com', senha: 'senha123' })
  superToken = login.body.token

  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'clinica-cancel-test', nome: 'Clínica Cancel Test' })
    .select('id')
    .single()
  testOrgId = org!.id

  await supabase
    .from('usuarios')
    .upsert({ email: 'admin.cancel@test.com', senha_hash: senhaHash, role: 'admin', tenant_id: testOrgId, ativo: true }, { onConflict: 'email' })
})

afterAll(async () => {
  await supabase.from('usuarios').delete().eq('email', 'admin.cancel@test.com')
  await supabase.from('usuarios').delete().eq('email', 'super.teste@orrin.com')
  await supabase.from('organizacoes').delete().eq('id', testOrgId)
})

describe('POST /api/admin/tenants', () => {
  let novoOrgId: string

  afterAll(async () => {
    if (novoOrgId) {
      await supabase.from('followup_regras').delete().eq('tenant_id', novoOrgId)
      await supabase.from('usuarios').delete().eq('tenant_id', novoOrgId)
      await supabase.from('organizacoes').delete().eq('id', novoOrgId)
    }
  })

  it('cria a clínica já com as 4 regras de follow-up padrão', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ slug: `clinica-seed-test-${Date.now()}`, nome: 'Clínica Seed Test', admin_email: `seed-${Date.now()}@test.com` })
    expect(res.status).toBe(201)
    novoOrgId = res.body.org.id

    const { data: regras } = await supabase
      .from('followup_regras')
      .select('gatilho')
      .eq('tenant_id', novoOrgId)
    const gatilhos = (regras ?? []).map((r) => r.gatilho).sort()
    expect(gatilhos).toEqual(['lembrete_agendamento', 'lembrete_dia', 'nao_respondeu', 'no_show'])
  })
})

describe('POST /api/admin/tenants/:id/cancel', () => {
  it('desativa a organizacao e os usuarios dela', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${testOrgId}/cancel`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)

    const { data: org } = await supabase
      .from('organizacoes')
      .select('ativo, deleted_at')
      .eq('id', testOrgId)
      .single()
    expect(org?.ativo).toBe(false)
    expect(org?.deleted_at).not.toBeNull()

    const { data: user } = await supabase
      .from('usuarios')
      .select('ativo')
      .eq('email', 'admin.cancel@test.com')
      .single()
    expect(user?.ativo).toBe(false)
  })

  it('retorna 403 para usuario nao super_admin', async () => {
    const senhaHash = await bcrypt.hash('senha123', 10)
    await supabase
      .from('usuarios')
      .upsert({ email: 'admin.teste@orrin.com', senha_hash: senhaHash, role: 'admin', ativo: true }, { onConflict: 'email' })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.teste@orrin.com', senha: 'senha123' })

    const res = await request(app)
      .post(`/api/admin/tenants/${testOrgId}/cancel`)
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(403)

    await supabase.from('usuarios').delete().eq('email', 'admin.teste@orrin.com')
  })
})

describe('POST /api/admin/tenants/:id/impersonate', () => {
  let impersonateOrgId: string
  let impersonateOrgSlug: string

  beforeAll(async () => {
    const slug = `clinica-impersonate-test-${Date.now()}`
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug, nome: 'Clínica Impersonate Test' })
      .select('id, slug')
      .single()
    impersonateOrgId = org!.id
    impersonateOrgSlug = org!.slug

    await supabase
      .from('profissionais')
      .insert({ nome: 'Profissional Impersonate', tenant_id: impersonateOrgId })
  })

  afterAll(async () => {
    await supabase.from('profissionais').delete().eq('tenant_id', impersonateOrgId)
    await supabase.from('organizacoes').delete().eq('id', impersonateOrgId)
  })

  it('retorna um token de impersonacao para super_admin', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.org.id).toBe(impersonateOrgId)
  })

  it('retorna 404 com id inexistente', async () => {
    const res = await request(app)
      .post('/api/admin/tenants/00000000-0000-0000-0000-000000000000/impersonate')
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(404)
  })

  it('o token de impersonacao acessa dados reais da clinica', async () => {
    const impersonateRes = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    const impersonateToken = impersonateRes.body.token

    const res = await request(app)
      .get('/api/profissionais')
      .set('Authorization', `Bearer ${impersonateToken}`)
      .set('Host', `${impersonateOrgSlug}.orrin.com.br`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].nome).toBe('Profissional Impersonate')
  })

  it('bloqueia escrita (POST) durante impersonacao', async () => {
    const impersonateRes = await request(app)
      .post(`/api/admin/tenants/${impersonateOrgId}/impersonate`)
      .set('Authorization', `Bearer ${superToken}`)
    const impersonateToken = impersonateRes.body.token

    const res = await request(app)
      .post('/api/profissionais')
      .set('Authorization', `Bearer ${impersonateToken}`)
      .set('Host', `${impersonateOrgSlug}.orrin.com.br`)
      .send({ nome: 'Tentativa de escrita' })
    expect(res.status).toBe(403)
  })
})

describe('GET/PATCH /api/admin/tenants/:id/prompt', () => {
  let promptOrgId: string
  let promptOrgSlug: string

  beforeAll(async () => {
    const senhaHash = await bcrypt.hash('senha123', 10)
    promptOrgSlug = `clinica-prompt-test-${Date.now()}`
    const { data: org } = await supabase
      .from('organizacoes')
      .insert({ slug: promptOrgSlug, nome: 'Clínica Prompt Test' })
      .select('id')
      .single()
    promptOrgId = org!.id

    await supabase
      .from('usuarios')
      .upsert({ email: 'admin.prompt@test.com', senha_hash: senhaHash, role: 'admin', tenant_id: promptOrgId, ativo: true }, { onConflict: 'email' })
  })

  afterAll(async () => {
    await supabase.from('configuracoes').delete().eq('tenant_id', promptOrgId)
    await supabase.from('usuarios').delete().eq('email', 'admin.prompt@test.com')
    await supabase.from('organizacoes').delete().eq('id', promptOrgId)
  })

  it('retorna vazio quando a clínica ainda não tem prompt salvo', async () => {
    const res = await request(app)
      .get(`/api/admin/tenants/${promptOrgId}/prompt`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)
    expect(res.body.prompt_ana).toBe('')
  })

  it('salva e devolve o prompt da clínica', async () => {
    const texto = 'Você é Ana, atendente da Clínica Prompt Test.'
    const patch = await request(app)
      .patch(`/api/admin/tenants/${promptOrgId}/prompt`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ prompt_ana: texto })
    expect(patch.status).toBe(200)

    const get = await request(app)
      .get(`/api/admin/tenants/${promptOrgId}/prompt`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(get.body.prompt_ana).toBe(texto)
  })

  it('salva o modelo sem afetar o prompt já salvo', async () => {
    const patch = await request(app)
      .patch(`/api/admin/tenants/${promptOrgId}/prompt`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ ana_model: 'claude-sonnet-4-6' })
    expect(patch.status).toBe(200)

    const get = await request(app)
      .get(`/api/admin/tenants/${promptOrgId}/prompt`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(get.body.ana_model).toBe('claude-sonnet-4-6')
    expect(get.body.prompt_ana).toBe('Você é Ana, atendente da Clínica Prompt Test.') // do teste anterior, não foi apagado
  })

  it('retorna 404 pra clínica inexistente', async () => {
    const res = await request(app)
      .patch('/api/admin/tenants/00000000-0000-0000-0000-000000000000/prompt')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ prompt_ana: 'teste' })
    expect(res.status).toBe(404)
  })

  it('a própria clínica não consegue editar o prompt pela rota normal de configurações', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.prompt@test.com', senha: 'senha123' })
    const clinicaToken = login.body.token

    const res = await request(app)
      .patch('/api/configuracoes/prompt_ana')
      .set('Authorization', `Bearer ${clinicaToken}`)
      .set('Host', `${promptOrgSlug}.orrin.com.br`)
      .send({ valor: 'tentativa de edição direta' })
    expect(res.status).toBe(403)
  })
})

describe('GET/POST /api/admin/tenants/:id/usuarios', () => {
  let orgId: string
  let orgSlug: string
  let usuarioId: string
  const email = 'admin.resetsenha@test.com'

  beforeAll(async () => {
    orgSlug = `reset-senha-test-${Date.now()}`
    const { data: org } = await supabase
      .from('organizacoes').insert({ slug: orgSlug, nome: 'Reset Senha Test' }).select('id').single()
    orgId = org!.id
    const senhaHash = await bcrypt.hash('senhaOriginal1', 10)
    const { data: usuario } = await supabase
      .from('usuarios').insert({ email, senha_hash: senhaHash, role: 'admin', tenant_id: orgId, ativo: true })
      .select('id').single()
    usuarioId = usuario!.id
  })

  afterAll(async () => {
    await supabase.from('usuarios').delete().eq('tenant_id', orgId)
    await supabase.from('organizacoes').delete().eq('id', orgId)
  })

  it('lista os usuários da clínica', async () => {
    const res = await request(app)
      .get(`/api/admin/tenants/${orgId}/usuarios`)
      .set('Authorization', `Bearer ${superToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe(email)
  })

  it('reseta a senha com valor customizado e permite login com ela', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${orgId}/usuarios/${usuarioId}/resetar-senha`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ senha: 'novaSenha456' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email, senha: 'novaSenha456' })

    const login = await request(app).post('/api/auth/login').send({ email, senha: 'novaSenha456' })
    expect(login.status).toBe(200)

    const loginAntiga = await request(app).post('/api/auth/login').send({ email, senha: 'senhaOriginal1' })
    expect(loginAntiga.status).toBe(401)
  })

  it('reseta pro padrão senha123 quando nenhuma senha é informada', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${orgId}/usuarios/${usuarioId}/resetar-senha`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.senha).toBe('senha123')

    const login = await request(app).post('/api/auth/login').send({ email, senha: 'senha123' })
    expect(login.status).toBe(200)
  })

  it('não reseta senha de usuário de outra clínica (proteção cross-tenant)', async () => {
    const { data: outraOrg } = await supabase
      .from('organizacoes').insert({ slug: `outra-org-reset-${Date.now()}`, nome: 'Outra Org' }).select('id').single()
    const res = await request(app)
      .post(`/api/admin/tenants/${outraOrg!.id}/usuarios/${usuarioId}/resetar-senha`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ senha: 'naoDeveriaFuncionar1' })
    expect(res.status).toBe(404)
    await supabase.from('organizacoes').delete().eq('id', outraOrg!.id)
  })
})
