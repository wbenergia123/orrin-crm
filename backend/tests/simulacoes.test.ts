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
  // ponytail: só limpa o prefixo fixo plantado pelo teste de clone; os paths
  // gerados por simulação real (fotos_N, modelo.glb por sim.id aleatório) ficam
  // órfãos no bucket — listar recursivamente por tenant é custoso para um teste.
  await supabase.storage.from('simulacoes-3d').remove([`${tenantId}/clone-origem/modelo.glb`])
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
