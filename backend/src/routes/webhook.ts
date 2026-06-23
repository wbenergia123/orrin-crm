// backend/src/routes/webhook.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { processarComAgente } from '../lib/claude-agent'
import { enviarMensagemViaUAZAPI } from '../lib/uazapi-client'

const router = Router()

// URL: POST /api/webhook/whatsapp/:tenantSlug
// Cada instância UAZAPI aponta para esta URL com o slug da clínica
router.post('/whatsapp/:tenantSlug', async (req: Request, res: Response) => {
  try {
    const { tenantSlug } = req.params
    const { data: msg } = req.body

    const texto = msg?.message?.text?.body
    if (!texto || typeof texto !== 'string') return res.json({ result: 'ok' })

    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('id, ativo')
      .eq('slug', tenantSlug.toLowerCase())
      .is('deleted_at', null)
      .single()

    if (!org || !org.ativo) return res.status(404).json({ error: 'Org não encontrada' })

    const telefone = msg.from
    const tenantId = org.id

    let { data: paciente } = await supabaseAdmin
      .from('pacientes')
      .select('id, status')
      .eq('telefone', telefone)
      .eq('tenant_id', tenantId)
      .single()

    if (!paciente) {
      const { data: novo } = await supabaseAdmin
        .from('pacientes')
        .insert({ telefone, status: 'novo', tenant_id: tenantId })
        .select('id, status')
        .single()
      paciente = novo
    }

    const pacienteId = paciente!.id

    // Verifica se está em modo humano (não processa com agente)
    const { data: ultimaConversa } = await supabaseAdmin
      .from('conversas_pacientes')
      .select('modo_humano')
      .eq('paciente_id', pacienteId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (ultimaConversa?.modo_humano) {
      await supabaseAdmin.from('conversas_pacientes').insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        mensagem_paciente: texto,
        tipo_remetente: 'humano',
        modo_humano: true,
      })
      await supabaseAdmin
        .from('pacientes')
        .update({ ultimo_contato_at: new Date().toISOString() })
        .eq('id', pacienteId)
      console.log(`[WEBHOOK] Modo humano ativo para ${telefone} — mensagem salva sem resposta automática`)
      return res.json({ result: 'ok' })
    }

    await supabaseAdmin.from('conversas_pacientes').insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      mensagem_paciente: texto,
      tipo_remetente: 'humano',
      modo_humano: false,
    })

    await supabaseAdmin
      .from('pacientes')
      .update({ ultimo_contato_at: new Date().toISOString() })
      .eq('id', pacienteId)

    const respostaAgente = await processarComAgente(tenantId, pacienteId, [texto])

    const { data: ultimaMsg } = await supabaseAdmin
      .from('conversas_pacientes')
      .select('id, modo_humano')
      .eq('paciente_id', pacienteId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (ultimaMsg && !ultimaMsg.modo_humano) {
      await supabaseAdmin
        .from('conversas_pacientes')
        .update({ mensagem_agente: respostaAgente })
        .eq('id', ultimaMsg.id)
    }

    // Se modo humano foi ativado durante a geração, descarta a resposta
    const { data: modoAtual } = await supabaseAdmin
      .from('conversas_pacientes')
      .select('modo_humano')
      .eq('paciente_id', pacienteId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (modoAtual?.modo_humano === true) {
      console.warn(`[WEBHOOK] Resposta descartada para ${pacienteId} — modo humano ativo durante geração.`)
      return res.json({ result: 'ok' })
    }

    await enviarMensagemViaUAZAPI({ phone: telefone, text: respostaAgente })

    res.json({ result: 'ok' })
  } catch (err) {
    console.error('Erro webhook:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default router
