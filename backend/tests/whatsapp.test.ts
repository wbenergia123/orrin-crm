import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import http from 'http'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let mockServer: http.Server
let mockBaseUrl: string

let tokenA: string
let tokenB: string
let tokenC: string
let orgAId: string
let orgBId: string
let orgCId: string
let slugA: string
let slugB: string
let slugC: string

beforeAll(async () => {
  // Servidor mock UAZAPI — responde de acordo com o token recebido
  mockServer = http.createServer((req, res) => {
    const token = req.headers.token as string | undefined
    res.setHeader('Content-Type', 'application/json')

    if (req.url === '/instance/status') {
      if (token === 'token-clinica-a') {
        res.end(JSON.stringify({ instance: { status: 'connected', owner: '5511991111111' } }))
      } else if (token === 'token-clinica-b') {
        res.end(JSON.stringify({ status: { connected: false } }))
      } else {
        res.statusCode = 401
        res.end(JSON.stringify({ error: 'token inválido' }))
      }
      return
    }

    if (req.url === '/instance/connect') {
      res.end(JSON.stringify({ instance: { qrcode: `qrcode-${token}` }, connected: false }))
      return
    }

    if (req.url === '/instance/disconnect') {
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve))
  const addr = mockServer.address() as { port: number }
  mockBaseUrl = `http://127.0.0.1:${addr.port}`

  const senhaHash = await bcrypt.hash('senha123', 10)
  const timestamp = Date.now()

  slugA = `clinica-a-${timestamp}`
  slugB = `clinica-b-${timestamp}`
  slugC = `clinica-c-${timestamp}`

  const [{ data: orgA }, { data: orgB }, { data: orgC }] = await Promise.all([
    supabase.from('organizacoes').insert({ slug: slugA, nome: 'Clínica A' }).select('id').single(),
    supabase.from('organizacoes').insert({ slug: slugB, nome: 'Clínica B' }).select('id').single(),
    supabase.from('organizacoes').insert({ slug: slugC, nome: 'Clínica C' }).select('id').single(),
  ])

  orgAId = orgA!.id
  orgBId = orgB!.id
  orgCId = orgC!.id

  await Promise.all([
    supabase.from('usuarios').insert({ email: `admin-a-${timestamp}@test.com`, senha_hash: senhaHash, role: 'admin', tenant_id: orgAId, ativo: true }),
    supabase.from('usuarios').insert({ email: `admin-b-${timestamp}@test.com`, senha_hash: senhaHash, role: 'admin', tenant_id: orgBId, ativo: true }),
    supabase.from('usuarios').insert({ email: `admin-c-${timestamp}@test.com`, senha_hash: senhaHash, role: 'admin', tenant_id: orgCId, ativo: true }),
  ])

  // Configura UAZAPI por clínica: A e B usam o servidor mock; C fica sem config.
  await supabase.from('configuracoes').insert([
    { tenant_id: orgAId, chave: 'uazapi_url', valor: mockBaseUrl },
    { tenant_id: orgAId, chave: 'uazapi_token', valor: 'token-clinica-a' },
    { tenant_id: orgBId, chave: 'uazapi_url', valor: mockBaseUrl },
    { tenant_id: orgBId, chave: 'uazapi_token', valor: 'token-clinica-b' },
  ])

  const [loginA, loginB, loginC] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: `admin-a-${timestamp}@test.com`, senha: 'senha123' }),
    request(app).post('/api/auth/login').send({ email: `admin-b-${timestamp}@test.com`, senha: 'senha123' }),
    request(app).post('/api/auth/login').send({ email: `admin-c-${timestamp}@test.com`, senha: 'senha123' }),
  ])

  tokenA = loginA.body.token
  tokenB = loginB.body.token
  tokenC = loginC.body.token
})

afterAll(async () => {
  await supabase.from('configuracoes').delete().in('tenant_id', [orgAId, orgBId, orgCId])
  await supabase.from('usuarios').delete().in('tenant_id', [orgAId, orgBId, orgCId])
  await supabase.from('organizacoes').delete().in('id', [orgAId, orgBId, orgCId])

  await new Promise<void>((resolve, reject) => {
    mockServer.close((err) => (err ? reject(err) : resolve()))
  })
})

describe('GET /api/whatsapp/status', () => {
  it('retorna status conectado da clínica A', async () => {
    const res = await request(app)
      .get('/api/whatsapp/status')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${slugA}.orrin.com.br`)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('connected')
    expect(res.body.phone).toBe('5511991111111')
  })

  it('retorna status desconectado da clínica B', async () => {
    const res = await request(app)
      .get('/api/whatsapp/status')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Host', `${slugB}.orrin.com.br`)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('disconnected')
  })

  it('retorna erro quando a clínica não tem UAZAPI configurado', async () => {
    const res = await request(app)
      .get('/api/whatsapp/status')
      .set('Authorization', `Bearer ${tokenC}`)
      .set('Host', `${slugC}.orrin.com.br`)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('disconnected')
    expect(res.body.error).toBe('UAZAPI_URL não configurada')
  })
})

describe('POST /api/whatsapp/connect', () => {
  it('gera QR code usando a instância da clínica A', async () => {
    const res = await request(app)
      .post('/api/whatsapp/connect')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${slugA}.orrin.com.br`)

    expect(res.status).toBe(200)
    expect(res.body.qrcode).toBe('qrcode-token-clinica-a')
  })
})
