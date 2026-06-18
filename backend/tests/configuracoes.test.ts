import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let token: string
beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@clinica.com', senha: 'admin123' })
  token = res.body.token
})

afterAll(async () => {
  await supabase
    .from('configuracoes')
    .update({ valor: 'Você é Ana, uma assistente de atendimento para uma clínica estética.' })
    .eq('chave', 'prompt_ana')
  await supabase.from('configuracoes_historico').delete().eq('chave', 'telefone_clinica')
})

describe('GET /api/configuracoes', () => {
  it('retorna todas as configurações', async () => {
    const res = await request(app)
      .get('/api/configuracoes')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.configuracoes)).toBe(true)
    const chaves = res.body.configuracoes.map((c: { chave: string }) => c.chave)
    expect(chaves).toContain('prompt_ana')
    expect(chaves).toContain('nome_clinica')
  })

  it('requer autenticação', async () => {
    const res = await request(app).get('/api/configuracoes')
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/configuracoes/:chave', () => {
  it('atualiza uma chave', async () => {
    const novoValor = 'Nova clínica teste'
    const res = await request(app)
      .patch('/api/configuracoes/nome_clinica')
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: novoValor })

    expect(res.status).toBe(200)
    expect(res.body.sucesso).toBe(true)

    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'nome_clinica')
      .single()
    expect(data?.valor).toBe(novoValor)
  })

  it('rejeita prompt_ana vazio com 400', async () => {
    const res = await request(app)
      .patch('/api/configuracoes/prompt_ana')
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/vazio/i)
  })

  it('aceita nome_clinica vazio', async () => {
    const res = await request(app)
      .patch('/api/configuracoes/nome_clinica')
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: '' })

    expect(res.status).toBe(200)
  })

  it('salva entrada no historico ao atualizar', async () => {
    await request(app)
      .patch('/api/configuracoes/telefone_clinica')
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: '(41) 99999-0001' })

    const { data } = await supabase
      .from('configuracoes_historico')
      .select('chave')
      .eq('chave', 'telefone_clinica')
      .limit(1)
    expect(data?.length).toBeGreaterThan(0)
  })
})
