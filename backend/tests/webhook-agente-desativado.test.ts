import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabase } from '../src/db/supabase'

const app = createApp()

let orgId: string
let slug: string
const telefone = '5511977778888'

beforeAll(async () => {
  slug = `webhook-agente-off-${Date.now()}`
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug, nome: 'Clínica Agente Desativado Teste' })
    .select('id')
    .single()
  orgId = org!.id
  await supabase.from('configuracoes').insert({ tenant_id: orgId, chave: 'agente_ativo', valor: 'false' })
})

afterAll(async () => {
  await supabase.from('conversas_pacientes').delete().eq('tenant_id', orgId)
  await supabase.from('pacientes').delete().eq('tenant_id', orgId)
  await supabase.from('configuracoes').delete().eq('tenant_id', orgId)
  await supabase.from('organizacoes').delete().eq('id', orgId)
})

function incomingPayload(phone: string, text: string) {
  return {
    EventType: 'messages',
    chat: { phone, wa_chatid: `${phone}@s.whatsapp.net`, wa_isGroup: false },
    message: {
      text,
      type: 'Conversation',
      messageType: 'Conversation',
      mediaType: '',
      fromMe: false,
      id: `msg-${Date.now()}`,
      messageid: `msg-${Date.now()}`,
      messageTimestamp: Date.now(),
      chatid: `${phone}@s.whatsapp.net`,
    },
  }
}

describe('POST /api/webhook/whatsapp/:tenantSlug — agente_ativo=false', () => {
  it('salva a mensagem do cliente mas não gera resposta do agente', async () => {
    const res = await request(app)
      .post(`/api/webhook/whatsapp/${slug}`)
      .send(incomingPayload(telefone, 'Olá, quero saber sobre os implementos'))

    expect(res.status).toBe(200)

    const { data: paciente } = await supabase
      .from('pacientes').select('id, status').eq('telefone', telefone).eq('tenant_id', orgId).single()
    expect(paciente).toBeTruthy()
    expect(paciente!.status).toBe('novo')

    const { data: conversas } = await supabase
      .from('conversas_pacientes').select('mensagem_paciente, mensagem_agente')
      .eq('paciente_id', paciente!.id).eq('tenant_id', orgId)
    expect(conversas).toHaveLength(1)
    expect(conversas![0].mensagem_paciente).toBe('Olá, quero saber sobre os implementos')
    expect(conversas![0].mensagem_agente).toBeNull()
  })
})
