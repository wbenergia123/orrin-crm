import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { createServer } from 'http'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()
let token: string
let pacienteId: string
let orgId: string
let host: string

const authed = (r: request.Test) => r.set('Authorization', `Bearer ${token}`).set('Host', host)

let uazapiDeveFalhar = false
let server: ReturnType<typeof createServer>

function startFakeUazapi(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      if (req.url === '/send/text') {
        if (uazapiDeveFalhar) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'falha simulada' }))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        }
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      process.env.UAZAPI_URL = `http://localhost:${port}`
      process.env.UAZAPI_TOKEN = 'test-token'
      resolve()
    })
  })
}

beforeAll(async () => {
  await startFakeUazapi()

  const orgSlug = `atendimentos-test-${Date.now()}`
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: orgSlug, nome: 'Atendimentos Test' })
    .select('id')
    .single()
  orgId = org!.id
  host = `${orgSlug}.orrin.com.br`

  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: 'sec_atend@clinica.com', senha_hash: hash, role: 'secretaria', tenant_id: orgId },
    { onConflict: 'email' }
  )
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sec_atend@clinica.com', senha: 'senha123' })
  token = loginRes.body.token

  const { data: p } = await supabase
    .from('pacientes')
    .insert({ tenant_id: orgId, telefone: '5511977770001', nome: 'Paciente Atend Test' })
    .select('id')
    .single()
  pacienteId = p!.id
})

afterAll(async () => {
  await supabase.from('conversas_pacientes').delete().eq('paciente_id', pacienteId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  await supabase.from('usuarios').delete().eq('tenant_id', orgId)
  await supabase.from('organizacoes').delete().eq('id', orgId)
  await new Promise((resolve) => server.close(() => resolve(undefined)))
})

describe('POST /api/atendimentos/:paciente_id/mensagem', () => {
  it('retorna 404 para paciente inexistente', async () => {
    const res = await authed(request(app).post('/api/atendimentos/00000000-0000-0000-0000-000000000000/mensagem'))
      .send({ texto: 'Olá!' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Paciente não encontrado')
  })

  it('retorna 400 se paciente não está em modo humano', async () => {
    const res = await authed(request(app).post(`/api/atendimentos/${pacienteId}/mensagem`))
      .send({ texto: 'Olá, como posso ajudar?' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Paciente não está em modo humano')
  })

  it('retorna 400 se texto está vazio', async () => {
    const res = await authed(request(app).post(`/api/atendimentos/${pacienteId}/mensagem`))
      .send({ texto: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('texto é obrigatório')
  })

  it('salva mensagem e retorna 201 quando em modo humano', async () => {
    // Ativa modo humano antes deste teste
    await authed(request(app).patch(`/api/atendimentos/${pacienteId}/handoff`))
      .send({ modo_humano: true })

    const res = await authed(request(app).post(`/api/atendimentos/${pacienteId}/mensagem`))
      .send({ texto: 'Olá, vou verificar sua consulta!' })

    expect(res.status).toBe(201)
    expect(res.body.mensagem_agente).toBe('Olá, vou verificar sua consulta!')
    expect(res.body.tipo_remetente).toBe('humano')
    expect(res.body.modo_humano).toBe(true)
  })

  it('retorna entregue=true quando o envio ao WhatsApp funciona', async () => {
    uazapiDeveFalhar = false

    const res = await authed(request(app).post(`/api/atendimentos/${pacienteId}/mensagem`))
      .send({ texto: 'Mensagem que deve chegar' })

    expect(res.status).toBe(201)
    expect(res.body.entregue).toBe(true)
  })

  // Reproduz o caso real: instância do WhatsApp caiu (ex: "logged out from
  // another device"), mas a mensagem continua sendo salva no CRM como se
  // tivesse sido enviada — precisa ficar visível que não chegou de verdade.
  it('retorna entregue=false e registra aviso na conversa quando o envio ao WhatsApp falha', async () => {
    uazapiDeveFalhar = true

    const res = await authed(request(app).post(`/api/atendimentos/${pacienteId}/mensagem`))
      .send({ texto: 'Mensagem que não deve chegar' })

    expect(res.status).toBe(201)
    expect(res.body.entregue).toBe(false)

    const { data: ultimasConversas } = await supabase
      .from('conversas_pacientes')
      .select('mensagem_agente')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(ultimasConversas?.[0].mensagem_agente).toContain('[SISTEMA] Falha ao enviar')

    uazapiDeveFalhar = false
  })
})
