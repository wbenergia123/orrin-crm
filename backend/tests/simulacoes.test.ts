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
const ORG_SLUG = 'studio3d-sim-test'

beforeAll(async () => {
  // Org dedicada (não escolhida aleatoriamente entre as ativas) para não ser
  // afetada por outros arquivos de teste rodando em paralelo (ex: admin.test.ts
  // desativa/soft-deleta orgs durante a suite). Reaproveita a linha se sobrou
  // de uma execução anterior abortada.
  const orgState = { ativo: true, studio_3d_ativo: true, studio_3d_limite_creditos_mes: 150 }
  const { data: existente } = await supabase
    .from('organizacoes')
    .select('id, slug')
    .eq('slug', ORG_SLUG)
    .maybeSingle()

  let org: { id: string; slug: string }
  if (existente) {
    const { data: atualizada } = await supabase
      .from('organizacoes')
      .update({ ...orgState, deleted_at: null })
      .eq('id', existente.id)
      .select('id, slug')
      .single()
    org = atualizada!
  } else {
    const { data: criada } = await supabase
      .from('organizacoes')
      .insert({ slug: ORG_SLUG, nome: 'Clínica Studio3D Test', ...orgState })
      .select('id, slug')
      .single()
    org = criada!
  }
  tenantId = org.id
  host = `${org.slug}.orrin.com.br`

  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert({ email: EMAIL, senha_hash: hash, role: 'secretaria', tenant_id: tenantId, ativo: true }, { onConflict: 'email' })

  const login = await request(app).post('/api/auth/login').set('Host', host).send({ email: EMAIL, senha: 'senha123' })
  token = login.body.token

  const { data: pac } = await supabase.from('pacientes')
    .insert({ tenant_id: tenantId, nome: 'Paciente Teste Studio3D', telefone: '5511999990000' }).select('id').single()
  pacienteId = pac!.id
})

afterAll(async () => {
  await supabase.from('simulacoes_3d').delete().eq('paciente_id', pacienteId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  // ponytail: só limpa o prefixo fixo plantado pelo teste de clone; os paths
  // gerados por simulação real (fotos_N, modelo.glb por sim.id aleatório) ficam
  // órfãos no bucket — listar recursivamente por tenant é custoso para um teste.
  await supabase.storage.from('simulacoes-3d').remove([`${tenantId}/clone-origem/modelo.glb`])
  await supabase.from('usuarios').delete().eq('email', EMAIL)

  const { error } = await supabase.from('organizacoes').delete().eq('id', tenantId)
  if (error) {
    // sobrou algo referenciando o tenant (ex: rodada anterior abortada) — limpa e tenta de novo
    await supabase.from('followup_regras').delete().eq('tenant_id', tenantId)
    await supabase.from('configuracoes').delete().eq('tenant_id', tenantId)
    await supabase.from('organizacoes').delete().eq('id', tenantId)
    // ponytail: se ainda falhar (outro leftover inesperado), deixa a org pra próxima
    // rodada reaproveitar via upsert-by-slug acima — não derruba o teste por isso.
  }
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

function fotoPng(nome: string) {
  // PNG 1x1 válido
  return { buffer: Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex'), nome }
}

describe('POST /api/simulacoes', () => {
  it('retorna 400 com menos de 2 fotos', async () => {
    const f = fotoPng('frontal.png')
    const res = await request(app).post('/api/simulacoes')
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .field('paciente_id', pacienteId)
      .attach('fotos', f.buffer, f.nome)
    expect(res.status).toBe(400)
  })

  it('retorna 422 quando o teto de créditos do mês estourou', async () => {
    await supabase.from('organizacoes').update({ studio_3d_limite_creditos_mes: 0 }).eq('id', tenantId)
    const f1 = fotoPng('a.png'); const f2 = fotoPng('b.png')
    const res = await request(app).post('/api/simulacoes')
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .field('paciente_id', pacienteId)
      .attach('fotos', f1.buffer, f1.nome).attach('fotos', f2.buffer, f2.nome)
    expect(res.status).toBe(422)
    await supabase.from('organizacoes').update({ studio_3d_limite_creditos_mes: 150 }).eq('id', tenantId)
  })

  it('cria simulação pending e dispara a Meshy', async () => {
    const f1 = fotoPng('a.png'); const f2 = fotoPng('b.png')
    const res = await request(app).post('/api/simulacoes')
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .field('paciente_id', pacienteId)
      .attach('fotos', f1.buffer, f1.nome).attach('fotos', f2.buffer, f2.nome)
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(res.body.meshy_task_id).toBe('task-mock-123')
    expect(meshy.criarTask).toHaveBeenCalled()
  })

  it('clona modelo existente sem chamar a Meshy', async () => {
    const glbPath = `${tenantId}/clone-origem/modelo.glb`
    await supabase.storage.from('simulacoes-3d').upload(glbPath, Buffer.from('glb-fake'), { contentType: 'model/gltf-binary', upsert: true })
    const { data: origem } = await supabase.from('simulacoes_3d').insert({
      tenant_id: tenantId, paciente_id: pacienteId, status: 'succeeded',
      modelo_glb_path: glbPath, ancoras: { nariz_ponta: { x: 0, y: 0.1, z: 0.05 } },
    }).select('id').single()

    const chamadasAntes = (meshy.criarTask as any).mock.calls.length
    const res = await request(app).post('/api/simulacoes')
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .field('paciente_id', pacienteId)
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('succeeded')
    expect(res.body.ancoras).toEqual({ nariz_ponta: { x: 0, y: 0.1, z: 0.05 } })
    expect((meshy.criarTask as any).mock.calls.length).toBe(chamadasAntes)
    expect(res.body.modelo_glb_url).toContain('modelo.glb')
    expect(res.body.modelo_glb_url).not.toContain('meshy.ai')

    await supabase.from('simulacoes_3d').delete().eq('id', origem!.id)
  })
})

describe('GET /api/simulacoes/:id (polling)', () => {
  async function plantarProcessing(extra: Record<string, unknown> = {}) {
    const { data } = await supabase.from('simulacoes_3d').insert({
      tenant_id: tenantId, paciente_id: pacienteId, status: 'processing',
      meshy_task_id: 'task-poll', creditos_consumidos: 30, ...extra,
    }).select('id').single()
    return data!.id
  }

  it('SUCCEEDED na Meshy → baixa GLB, salva no bucket e marca succeeded', async () => {
    const id = await plantarProcessing()
    ;(meshy.consultarTask as any).mockResolvedValueOnce({
      status: 'SUCCEEDED', progress: 100,
      model_urls: { glb: 'https://assets.meshy.ai/fake/modelo.glb' },
      thumbnail_url: 'https://assets.meshy.ai/fake/thumb.png',
    })
    const res = await request(app).get(`/api/simulacoes/${id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('succeeded')
    expect(res.body.modelo_glb_url).toContain('modelo.glb')  // signed URL do NOSSO bucket
    expect(res.body.modelo_glb_url).not.toContain('meshy.ai')
    expect(meshy.baixarArquivo).toHaveBeenCalled()
    await supabase.from('simulacoes_3d').delete().eq('id', id)
  })

  it('FAILED na Meshy → failed com créditos zerados', async () => {
    const id = await plantarProcessing()
    ;(meshy.consultarTask as any).mockResolvedValueOnce({ status: 'FAILED' })
    const res = await request(app).get(`/api/simulacoes/${id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.body.status).toBe('failed')
    expect(res.body.creditos_consumidos).toBe(0)
    await supabase.from('simulacoes_3d').delete().eq('id', id)
  })

  it('processing há mais de 10 min sem resposta → failed', async () => {
    const antiga = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const id = await plantarProcessing({ criado_em: antiga })
    ;(meshy.consultarTask as any).mockResolvedValueOnce({ status: 'IN_PROGRESS', progress: 40 })
    const res = await request(app).get(`/api/simulacoes/${id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(res.body.status).toBe('failed')
    await supabase.from('simulacoes_3d').delete().eq('id', id)
  })
})

describe('PATCH /api/simulacoes/:id', () => {
  it('persiste âncoras e sliders', async () => {
    const { data: sim } = await supabase.from('simulacoes_3d').insert({
      tenant_id: tenantId, paciente_id: pacienteId, status: 'succeeded',
    }).select('id').single()
    const res = await request(app).patch(`/api/simulacoes/${sim!.id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .send({ ancoras: { nariz_ponta: { x: 0.1, y: 0.2, z: 0.3 } }, sliders: { nariz_ponta: 0.5 }, notas: 'teste' })
    expect(res.status).toBe(200)
    expect(res.body.sliders.nariz_ponta).toBe(0.5)
    await supabase.from('simulacoes_3d').delete().eq('id', sim!.id)
  })

  it('rejeita slider fora de -1..1', async () => {
    const { data: sim } = await supabase.from('simulacoes_3d').insert({
      tenant_id: tenantId, paciente_id: pacienteId, status: 'succeeded',
    }).select('id').single()
    const res = await request(app).patch(`/api/simulacoes/${sim!.id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .send({ sliders: { nariz_ponta: 5 } })
    expect(res.status).toBe(400)
    await supabase.from('simulacoes_3d').delete().eq('id', sim!.id)
  })
})

describe('screenshot e delete', () => {
  it('salva screenshot png e depois deleta a simulação', async () => {
    const { data: sim } = await supabase.from('simulacoes_3d').insert({
      tenant_id: tenantId, paciente_id: pacienteId, status: 'succeeded',
    }).select('id').single()
    const png = fotoPng('shot.png')
    const up = await request(app).post(`/api/simulacoes/${sim!.id}/screenshot`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
      .attach('imagem', png.buffer, png.nome)
    expect(up.status).toBe(200)
    expect(up.body.screenshot_url).toBeTruthy()

    const del = await request(app).delete(`/api/simulacoes/${sim!.id}`)
      .set('Host', host).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
    const { data: some } = await supabase.from('simulacoes_3d').select('id').eq('id', sim!.id).maybeSingle()
    expect(some).toBeNull()
  })
})
