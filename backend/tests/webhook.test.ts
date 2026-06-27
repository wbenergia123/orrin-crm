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

describe('POST /api/webhook/whatsapp/:tenantSlug — mensagem fromMe', () => {
  it('registra como humano e não deixa a Ana responder por cima', async () => {
    const res = await request(app)
      .post(`/api/webhook/whatsapp/${slug}`)
      .send({
        EventType: 'messages',
        chat: { phone: telefone, wa_chatid: `${telefone}@s.whatsapp.net`, wa_isGroup: false },
        message: {
          text: 'Oi, aqui é a clínica, te liguei mais tarde',
          type: 'Conversation',
          messageType: 'Conversation',
          mediaType: '',
          fromMe: true,
          id: 'msg-1',
          messageid: 'msg-1',
          messageTimestamp: Date.now(),
          chatid: `${telefone}@s.whatsapp.net`,
        },
      })

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
    expect(conversas![0].modo_humano).toBe(true)
    expect(conversas![0].mensagem_agente).toBe('Oi, aqui é a clínica, te liguei mais tarde')
    expect(conversas![0].mensagem_paciente).toBeNull()
  })
})
