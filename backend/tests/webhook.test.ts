import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let orgId: string
let slug: string
const telefone = '5511988887777'

beforeAll(async () => {
  const timestamp = Date.now()
  slug = `webhook-test-${timestamp}`

  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug, nome: 'Clínica Webhook Teste' })
    .select('id')
    .single()
  orgId = org!.id
})

afterAll(async () => {
  await supabase.from('conversas_pacientes').delete().eq('tenant_id', orgId)
  await supabase.from('pacientes').delete().eq('tenant_id', orgId)
  await supabase.from('organizacoes').delete().eq('id', orgId)
})

function fromMePayload(phone: string, text: string) {
  return {
    EventType: 'messages',
    chat: { phone, wa_chatid: `${phone}@s.whatsapp.net`, wa_isGroup: false },
    message: {
      text,
      type: 'Conversation',
      messageType: 'Conversation',
      mediaType: '',
      fromMe: true,
      id: `msg-${Date.now()}`,
      messageid: `msg-${Date.now()}`,
      messageTimestamp: Date.now(),
      chatid: `${phone}@s.whatsapp.net`,
    },
  }
}

describe('POST /api/webhook/whatsapp/:tenantSlug — mensagem fromMe', () => {
  it('registra como humano sem ativar modo humano, quando a Ana ainda estava respondendo', async () => {
    const res = await request(app)
      .post(`/api/webhook/whatsapp/${slug}`)
      .send(fromMePayload(telefone, 'Oi, aqui é a clínica, te liguei mais tarde'))

    expect(res.status).toBe(200)

    const { data: paciente } = await supabase
      .from('pacientes')
      .select('id')
      .eq('telefone', telefone)
      .eq('tenant_id', orgId)
      .single()
    expect(paciente).not.toBeNull()

    const { data: conversas } = await supabase
      .from('conversas_pacientes')
      .select('*')
      .eq('paciente_id', paciente!.id)

    expect(conversas).toHaveLength(1)
    expect(conversas![0].tipo_remetente).toBe('humano')
    expect(conversas![0].modo_humano).toBe(false)
    expect(conversas![0].mensagem_agente).toBe('Oi, aqui é a clínica, te liguei mais tarde')
    expect(conversas![0].mensagem_paciente).toBeNull()
  })

  it('mantém modo humano true quando a conversa já estava assumida pela secretária', async () => {
    const telefone2 = '5511977776666'
    const { data: paciente } = await supabase
      .from('pacientes')
      .insert({ telefone: telefone2, status: 'em_conversa', tenant_id: orgId })
      .select('id')
      .single()

    await supabase.from('conversas_pacientes').insert({
      tenant_id: orgId,
      paciente_id: paciente!.id,
      tipo_remetente: 'humano',
      modo_humano: true,
      mensagem_agente: '[HANDOFF: secretária assumiu]',
    })

    const res = await request(app)
      .post(`/api/webhook/whatsapp/${slug}`)
      .send(fromMePayload(telefone2, 'já te respondo por aqui mesmo'))

    expect(res.status).toBe(200)

    const { data: conversas } = await supabase
      .from('conversas_pacientes')
      .select('*')
      .eq('paciente_id', paciente!.id)
      .order('created_at', { ascending: false })

    expect(conversas![0].modo_humano).toBe(true)
    expect(conversas![0].mensagem_agente).toBe('já te respondo por aqui mesmo')
  })
})
