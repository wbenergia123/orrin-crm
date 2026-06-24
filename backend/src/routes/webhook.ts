// backend/src/routes/webhook.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { processarComAgente } from '../lib/claude-agent'
import { enviarMensagemViaUAZAPI, getUazapiConfig } from '../lib/uazapi-client'
import { transcreverAudio } from '../lib/groq-transcriber'
import type { WebhookPayload } from '../types/webhook'

const router = Router()

function limparTelefone(raw: string | undefined): string {
  return (raw || '').replace('@s.whatsapp.net', '').replace(/\D/g, '')
}

// URL: POST /api/webhook/whatsapp/:tenantSlug
// Cada instância UAZAPI aponta para esta URL com o slug da clínica
// GET de verificação — alguns serviços (incluindo UAZAPI) fazem ping GET no webhook antes de enviar eventos
router.get('/whatsapp/:tenantSlug', (_req: Request, res: Response) => {
  res.json({ result: 'ok' })
})

router.post('/whatsapp/:tenantSlug', async (req: Request, res: Response) => {
  try {
    const { tenantSlug } = req.params
    const payload = req.body as WebhookPayload

    console.log(`[WEBHOOK] Recebido em /whatsapp/${tenantSlug} — messageType=${payload?.message?.messageType || 'n/a'} mediaType=${payload?.message?.mediaType || 'n/a'}`)

    if (!payload?.message) {
      console.log('[WEBHOOK] Payload sem message. Keys:', Object.keys(payload || {}).join(', '))
      return res.json({ result: 'ok' })
    }

    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('id, ativo')
      .eq('slug', tenantSlug.toLowerCase())
      .is('deleted_at', null)
      .single()

    if (!org || !org.ativo) return res.status(404).json({ error: 'Org não encontrada' })

    const tenantId = org.id
    const telefone = limparTelefone(payload.chat?.phone || payload.message?.chatid)
    if (!telefone) return res.status(400).json({ error: 'Telefone não encontrado' })

    let texto = payload.message.content?.text || payload.message.text || ''

    const isAudio =
      payload.message.messageType === 'AudioMessage' ||
      payload.message.mediaType === 'ptt' ||
      payload.message.mediaType === 'audio'

    if (isAudio && !texto) {
      const uazapiConfig = await getUazapiConfig(tenantId)
      if (!uazapiConfig) {
        console.error(`[WEBHOOK] UAZAPI não configurada para tenant ${tenantId} — não foi possível baixar áudio`)
        texto = '[Áudio - não foi possível transcrever a mensagem]'
      } else {
        const msgId = payload.message.id || payload.message.messageid
        console.log(`[WEBHOOK] Áudio recebido — id=${msgId} mediaType=${payload.message.mediaType}`)

        try {
          const downloadRes = await fetch(`${uazapiConfig.baseUrl}/message/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: uazapiConfig.token },
            body: JSON.stringify({ id: msgId, return_base64: true, generate_mp3: true }),
          })

          const downloadBody = await downloadRes.json() as Record<string, unknown>
          const b64 = (downloadBody.base64Data || downloadBody.base64) as string | undefined
          const mime = (downloadBody.mimetype || downloadBody.mimeType) as string | undefined

          if (downloadRes.ok && b64) {
            const transcricao = await transcreverAudio(b64, mime || 'audio/ogg')
            if (transcricao) texto = `[Áudio] ${transcricao}`
          } else if (!downloadRes.ok) {
            console.error(`[WEBHOOK] Falha ao baixar áudio: ${downloadRes.status}`, downloadBody)
          }
        } catch (err) {
          console.error('[WEBHOOK] Erro ao baixar/transcrever áudio:', err)
        }

        if (!texto) {
          texto = '[Áudio - não foi possível transcrever a mensagem]'
        }
      }
    }

    const isImage =
      payload.message.messageType === 'ImageMessage' ||
      payload.message.mediaType === 'image'

    if (isImage && !texto) {
      texto = '[Foto recebida]'
    }

    if (!texto) {
      console.log(`[WEBHOOK] Mensagem sem texto ignorada (type: ${payload.message.type}, mediaType: ${payload.message.mediaType})`)
      return res.json({ result: 'ok' })
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${telefone}: "${texto}"`)

    let { data: paciente } = await supabaseAdmin
      .from('pacientes')
      .select('id, status, nome')
      .eq('telefone', telefone)
      .eq('tenant_id', tenantId)
      .single()

    if (!paciente) {
      const { data: novo } = await supabaseAdmin
        .from('pacientes')
        .insert({ telefone, status: 'novo', tenant_id: tenantId })
        .select('id, status, nome')
        .single()
      paciente = novo
    }

    const pacienteId = paciente!.id

    // Atualiza nome do paciente se vier do contato do WhatsApp e ainda não tiver nome
    const contactName =
      payload.chat?.name ||
      payload.chat?.lead_name ||
      (payload.chat as { pushName?: string }).pushName

    if (contactName && !paciente?.nome) {
      await supabaseAdmin
        .from('pacientes')
        .update({ nome: contactName })
        .eq('id', pacienteId)
    }

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

    await enviarMensagemViaUAZAPI({ tenantId, phone: telefone, text: respostaAgente })

    res.json({ result: 'ok' })
  } catch (err) {
    console.error('Erro webhook:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default router
