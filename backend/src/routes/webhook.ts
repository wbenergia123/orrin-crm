// backend/src/routes/webhook.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { processarMensagemCliente, detectarIntencaoReuniao } from '../agents/pedro'

const router = Router()

// URL: POST /api/webhook/whatsapp/:tenantSlug
// Each UAZAPI instance points to this URL with the tenant's slug
router.post('/whatsapp/:tenantSlug', async (req: Request, res: Response) => {
  try {
    const { tenantSlug } = req.params
    const { data: msg } = req.body

    if (!msg?.message?.text?.body) return res.json({ result: 'ok' })

    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('id, ativo')
      .eq('slug', tenantSlug.toLowerCase())
      .is('deleted_at', null)
      .single()

    if (!org || !org.ativo) return res.status(404).json({ error: 'Org não encontrada' })

    const telefone = msg.from
    const mensagem = msg.message.text.body
    const tenantId = org.id

    let { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('telefone', telefone)
      .eq('tenant_id', tenantId)
      .single()

    if (!cliente) {
      const { data: novo } = await supabaseAdmin
        .from('clientes')
        .insert({ telefone, status: 'novo', tenant_id: tenantId })
        .select()
        .single()
      cliente = novo
    }

    const resposta = await processarMensagemCliente(cliente.id, mensagem)

    await fetch(`${process.env.UAZAPI_URL}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.UAZAPI_TOKEN}`,
      },
      body: JSON.stringify({ phone: telefone, message: resposta }),
    })

    if (detectarIntencaoReuniao(mensagem)) {
      console.log(`[INTENÇÃO REUNIÃO] cliente ${cliente.id} tenant ${tenantId}`)
    }

    res.json({ result: 'ok' })
  } catch (err) {
    console.error('Erro webhook:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default router
