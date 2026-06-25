import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

let token: string
let tenantId: string
let tenantSlug: string
let pacienteId: string
let injetavelPontoId: string
let injetavelPdoId: string
let injetavelEnzimaId: string
let atendimentoId: string
let fotoId: string
let imagemRefId: string

beforeAll(async () => {
  const senhaHash = await bcrypt.hash('senha123', 10)
  const ts = Date.now()
  tenantSlug = `marc-v2-${ts}`

  // Cria organização isolada
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: tenantSlug, nome: 'Marcação v2 Test' })
    .select('id')
    .single()
  tenantId = org!.id

  // Cria usuário admin
  const email = `admin.marc.v2.${ts}@test.com`
  await supabase
    .from('usuarios')
    .insert({ email, senha_hash: senhaHash, role: 'admin', tenant_id: tenantId, ativo: true })

  // Login
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, senha: 'senha123' })
    .set('Host', `${tenantSlug}.orrin.com.br`)
  token = login.body.token

  // Cria paciente
  const { data: paciente } = await supabase
    .from('pacientes')
    .insert({ nome: 'Paciente Marcação v2', telefone: `551199999${ts.toString().slice(-4)}`, tenant_id: tenantId })
    .select('id')
    .single()
  pacienteId = paciente!.id

  // Cria injetáveis de teste
  const [{ data: i1 }, { data: i2 }, { data: i3 }] = await Promise.all([
    supabase.from('injetaveis').insert({ nome: 'Toxina Teste', categoria: 'botox', cor_hex: '#ef4444', unidade: 'UI', tenant_id: tenantId }).select('id').single(),
    supabase.from('injetaveis').insert({ nome: 'PDO Teste', categoria: 'pdo_wire', cor_hex: '#3b82f6', unidade: 'fio', tenant_id: tenantId }).select('id').single(),
    supabase.from('injetaveis').insert({ nome: 'Enzima Teste', categoria: 'enzimas', cor_hex: '#10b981', unidade: 'UI', tenant_id: tenantId }).select('id').single(),
  ])
  injetavelPontoId = i1!.id
  injetavelPdoId = i2!.id
  injetavelEnzimaId = i3!.id

  // Cria atendimento
  const { data: atendimento } = await supabase
    .from('atendimentos')
    .insert({ paciente_id: pacienteId, tenant_id: tenantId })
    .select('id')
    .single()
  atendimentoId = atendimento!.id

  // Cria foto do paciente (registro mínimo, sem upload real)
  const { data: foto } = await supabase
    .from('fotos_paciente')
    .insert({ paciente_id: pacienteId, url: 'https://example.com/fake.jpg', tipo: 'geral', tenant_id: tenantId })
    .select('id')
    .single()
  fotoId = foto!.id
})

afterAll(async () => {
  await supabase.from('injection_markings').delete().eq('tenant_id', tenantId)
  await supabase.from('imagens_referencia').delete().eq('tenant_id', tenantId)
  await supabase.from('fotos_paciente').delete().eq('tenant_id', tenantId)
  await supabase.from('atendimentos').delete().eq('tenant_id', tenantId)
  await supabase.from('injetaveis').delete().eq('tenant_id', tenantId)
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)

  const { data: users } = await supabase.from('usuarios').select('id').eq('tenant_id', tenantId)
  for (const u of users ?? []) {
    await supabase.from('usuarios').delete().eq('id', u.id)
  }
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function authHeader() {
  return { Authorization: `Bearer ${token}`, Host: `${tenantSlug}.orrin.com.br` }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/marcacoes — tipos de desenho', () => {
  it('cria marcação do tipo ponto (regressão)', async () => {
    const res = await request(app)
      .post('/api/marcacoes')
      .set(authHeader())
      .send({
        visit_id: atendimentoId,
        paciente_id: pacienteId,
        view_type: 'face_front',
        x: 50,
        y: 50,
        product_id: injetavelPontoId,
        quantity: 10,
      })

    expect(res.status).toBe(201)
    expect(res.body.tipo_desenho).toBe('ponto')
    expect(res.body.pontos).toBeNull()
  })

  it('rejeita linha com menos de 2 pontos', async () => {
    const res = await request(app)
      .post('/api/marcacoes')
      .set(authHeader())
      .send({
        visit_id: atendimentoId,
        paciente_id: pacienteId,
        view_type: 'face_front',
        tipo_desenho: 'linha',
        pontos: [{ x: 10, y: 10 }],
        product_id: injetavelPdoId,
        quantity: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/pelo menos 2/)
  })

  it('cria marcação do tipo linha com 2+ pontos', async () => {
    const res = await request(app)
      .post('/api/marcacoes')
      .set(authHeader())
      .send({
        visit_id: atendimentoId,
        paciente_id: pacienteId,
        view_type: 'face_front',
        tipo_desenho: 'linha',
        pontos: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }],
        product_id: injetavelPdoId,
        quantity: 3,
      })

    expect(res.status).toBe(201)
    expect(res.body.tipo_desenho).toBe('linha')
    expect(res.body.pontos).toHaveLength(3)
    expect(res.body.x).toBe(10)
    expect(res.body.y).toBe(10)
  })

  it('rejeita forma com menos de 3 pontos', async () => {
    const res = await request(app)
      .post('/api/marcacoes')
      .set(authHeader())
      .send({
        visit_id: atendimentoId,
        paciente_id: pacienteId,
        view_type: 'face_front',
        tipo_desenho: 'forma',
        pontos: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
        product_id: injetavelPontoId,
        quantity: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/pelo menos 3/)
  })

  it('cria marcação do tipo forma com 3+ pontos', async () => {
    const res = await request(app)
      .post('/api/marcacoes')
      .set(authHeader())
      .send({
        visit_id: atendimentoId,
        paciente_id: pacienteId,
        view_type: 'face_front',
        tipo_desenho: 'forma',
        pontos: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }],
        product_id: injetavelPontoId,
        quantity: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body.tipo_desenho).toBe('forma')
    expect(res.body.pontos).toHaveLength(3)
  })
})

describe('PATCH /api/marcacoes/atendimentos/:id — fundo customizável', () => {
  it('atualiza background para foto do paciente com opacidade', async () => {
    const res = await request(app)
      .patch(`/api/marcacoes/atendimentos/${atendimentoId}`)
      .set(authHeader())
      .send({
        background_modo: 'foto_paciente',
        background_foto_id: fotoId,
        background_opacidade: 60,
      })

    expect(res.status).toBe(200)
    expect(res.body.background_modo).toBe('foto_paciente')
    expect(res.body.background_foto_id).toBe(fotoId)
    expect(res.body.background_opacidade).toBe(60)
  })

  it('rejeita opacidade fora do intervalo 10-100', async () => {
    const res = await request(app)
      .patch(`/api/marcacoes/atendimentos/${atendimentoId}`)
      .set(authHeader())
      .send({ background_opacidade: 5 })

    expect(res.status).toBe(400)
  })

  it('rejeita background_modo inválido', async () => {
    const res = await request(app)
      .patch(`/api/marcacoes/atendimentos/${atendimentoId}`)
      .set(authHeader())
      .send({ background_modo: 'invalido' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/marcacoes/atendimentos/:paciente_id — retorna campos de fundo', () => {
  it('lista atendimentos com background_* preenchidos', async () => {
    const res = await request(app)
      .get(`/api/marcacoes/atendimentos/${pacienteId}`)
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const atendimento = res.body.find((a: any) => a.id === atendimentoId)
    expect(atendimento).toBeDefined()
    expect(atendimento.background_modo).toBe('foto_paciente')
    expect(atendimento.background_opacidade).toBe(60)
  })
})

describe('/api/imagens-referencia', () => {
  let baseCount = 0

  it('lista imagens de referência (incluindo globais do tenant_id null)', async () => {
    const res = await request(app).get('/api/imagens-referencia').set(authHeader())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    baseCount = res.body.length
  })

  it('faz upload de imagem de referência', async () => {
    const form = request(app)
      .post('/api/imagens-referencia/upload')
      .set(authHeader())
      .field('nome', 'Rosto masculino')
      .attach('imagem', PNG_1X1, 'ref.png')

    const res = await form
    expect(res.status).toBe(201)
    expect(res.body.nome).toBe('Rosto masculino')
    expect(res.body.url).toContain('fotos-pacientes')
    imagemRefId = res.body.id
  })

  it('lista a imagem recém-uploadada', async () => {
    const res = await request(app).get('/api/imagens-referencia').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(baseCount + 1)
    expect(res.body.some((img: { id: string }) => img.id === imagemRefId)).toBe(true)
  })

  it('remove a imagem de referência', async () => {
    const res = await request(app).delete(`/api/imagens-referencia/${imagemRefId}`).set(authHeader())
    expect(res.status).toBe(200)

    const list = await request(app).get('/api/imagens-referencia').set(authHeader())
    expect(list.body.length).toBe(baseCount)
  })

  it('imagem global (tenant_id null) aparece pra qualquer clínica', async () => {
    const { data: global } = await supabase
      .from('imagens_referencia')
      .insert({ tenant_id: null, nome: 'Rosto masculino padrão', url: 'https://example.com/global.png' })
      .select('id')
      .single()

    const res = await request(app).get('/api/imagens-referencia').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.some((img: { id: string }) => img.id === global!.id)).toBe(true)

    // não pode ser apagada pela clínica comum (delete filtra por tenant_id próprio)
    const delRes = await request(app).delete(`/api/imagens-referencia/${global!.id}`).set(authHeader())
    expect(delRes.status).toBe(200)
    const { data: aindaExiste } = await supabase.from('imagens_referencia').select('id').eq('id', global!.id).single()
    expect(aindaExiste).not.toBeNull()

    await supabase.from('imagens_referencia').delete().eq('id', global!.id)
  })
})

describe('injetaveis.categoria — aceita enzimas', () => {
  it('aceita categoria enzimas na criação', async () => {
    const res = await request(app)
      .get('/api/injetaveis')
      .set(authHeader())

    expect(res.status).toBe(200)
    const categorias = res.body.map((i: any) => i.categoria)
    expect(categorias).toContain('enzimas')
  })
})
