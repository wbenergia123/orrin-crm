import { Router, Request, Response } from 'express';
import { WebhookPayload } from '../types/webhook';
import { debounceBuffer } from '../lib/debounce';
import { processarComAgente } from '../lib/claude-agent';
import { enviarMensagemViaUAZAPI } from '../lib/uazapi-client';
import { transcreverAudio } from '../lib/groq-transcriber';
import { supabase } from '../db/supabase';

const router = Router();

const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || '';

// Processa mensagens agrupadas após debounce
async function procesarMensagens(phone: string, mensagens: string[]): Promise<void> {
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, status')
    .eq('telefone', phone)
    .single();

  let pacienteId: string;

  if (pacienteError || !paciente) {
    const { data: novo, error: createError } = await supabase
      .from('pacientes')
      .insert([{ telefone: phone, status: 'novo' }])
      .select('id')
      .single();

    if (createError || !novo) {
      throw new Error(`Erro ao criar paciente: ${createError?.message}`);
    }

    pacienteId = novo.id;
    console.log(`[DEBOUNCE] Novo paciente criado: ${phone} (${pacienteId})`);
  } else {
    pacienteId = paciente.id;
    console.log(`[DEBOUNCE] Paciente existente: ${phone} (${pacienteId})`);
  }

  // Verifica se está em modo humano (não processa com agente)
  const { data: ultimaConversa } = await supabase
    .from('conversas')
    .select('modo_humano')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (ultimaConversa?.modo_humano) {
    // Salva a mensagem mas não responde — a secretária está atendendo
    await supabase.from('conversas').insert([{
      paciente_id: pacienteId,
      mensagem_paciente: mensagens.join('\n'),
      tipo_remetente: 'humano',
      modo_humano: true,
    }]);
    await supabase.from('pacientes')
      .update({ ultimo_contato_at: new Date().toISOString() })
      .eq('id', pacienteId);
    console.log(`[WEBHOOK] Modo humano ativo para ${phone} — mensagem salva sem resposta automática`);
    return;
  }

  const mensagemCombinada = mensagens.join('\n');

  const { error: insertError } = await supabase
    .from('conversas')
    .insert([{
      paciente_id: pacienteId,
      mensagem_paciente: mensagemCombinada,
      tipo_remetente: 'humano',
      modo_humano: false,
    }]);

  if (insertError) throw new Error(`Erro ao salvar conversa: ${insertError.message}`);

  await supabase.from('pacientes')
    .update({ ultimo_contato_at: new Date().toISOString() })
    .eq('id', pacienteId);

  console.log(`[DEBOUNCE] ${mensagens.length} mensagem(ns) processada(s) para ${phone}`);

  const respostaAgente = await processarComAgente(pacienteId, mensagens);

  // Salva a resposta na última conversa inserida (apenas se não for row de handoff)
  const { data: ultimaMsg } = await supabase
    .from('conversas')
    .select('id, modo_humano')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (ultimaMsg && !ultimaMsg.modo_humano) {
    await supabase.from('conversas')
      .update({ mensagem_agente: respostaAgente })
      .eq('id', ultimaMsg.id);
  }

  console.log(`[WEBHOOK] Resposta gerada e salva para ${phone}`);

  // Checa modo humano imediatamente antes do envio — atendente pode ter assumido durante a geração
  const { data: modoAtual } = await supabase
    .from('conversas')
    .select('modo_humano')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (modoAtual?.modo_humano === true) {
    console.warn(`[WEBHOOK] Resposta descartada para ${pacienteId} — modo humano ativo durante geração. Preview: "${respostaAgente.substring(0, 100)}"`)
    return
  }

  const enviado = await enviarMensagemViaUAZAPI({ phone, text: respostaAgente });

  if (enviado) {
    console.log(`[WEBHOOK] Resposta enviada com sucesso para ${phone}`);
  } else {
    console.error(`[WEBHOOK] Falha ao enviar resposta para ${phone}`);
  }
}

// POST /webhook — recebe eventos do UAZAPI
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body as WebhookPayload;

    // Valida token enviado pelo UAZAPI no body
    if (UAZAPI_TOKEN && payload.token !== UAZAPI_TOKEN) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Ignora eventos que não são mensagens de texto recebidas
    if (payload.EventType !== 'messages') {
      return res.json({ success: true, skipped: true });
    }

    if (payload.message?.fromMe) {
      return res.json({ success: true, skipped: true });
    }

    if (payload.chat?.wa_isGroup) {
      console.log(`[WEBHOOK] Mensagem de grupo ignorada (${payload.chat?.wa_chatid})`);
      return res.json({ success: true, skipped: true });
    }

    const isAudio = payload.message?.messageType === 'AudioMessage'
      || payload.message?.mediaType === 'ptt'
      || payload.message?.mediaType === 'audio'

    let text = payload.message?.text

    // Transcreve áudio se necessário
    if (isAudio && !text) {
      const baseUrl = process.env.UAZAPI_URL
      const token = process.env.UAZAPI_TOKEN

      const msgId = payload.message?.id || payload.message?.messageid
      console.log(`[WEBHOOK] Áudio recebido — id=${msgId} mediaType=${payload.message?.mediaType}`)

      try {
        const downloadRes = await fetch(`${baseUrl}/message/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': token || '' },
          body: JSON.stringify({ id: msgId, return_base64: true, generate_mp3: true }),
        })

        const downloadBody = await downloadRes.json() as Record<string, unknown>

        const b64 = (downloadBody.base64Data || downloadBody.base64) as string | undefined
        const mime = (downloadBody.mimetype || downloadBody.mimeType) as string | undefined
        if (downloadRes.ok && b64) {
          const transcricao = await transcreverAudio(b64, mime || 'audio/ogg')
          if (transcricao) {
            text = `[Áudio] ${transcricao}`
          }
        } else if (!downloadRes.ok) {
          console.error(`[WEBHOOK] Falha ao baixar áudio: ${downloadRes.status}`, downloadBody)
        }
      } catch (err) {
        console.error('[WEBHOOK] Erro ao baixar/transcrever áudio:', err)
      }
    }

    if (!text) {
      console.log(`[WEBHOOK] Mensagem sem texto ignorada (type: ${payload.message?.type}, mediaType: ${payload.message?.mediaType})`)
      return res.json({ success: true, skipped: true });
    }

    // Extrai número limpo do chat (remove @s.whatsapp.net se vier no chatid)
    const rawPhone = payload.chat?.phone || payload.message?.chatid || '';
    const phone = rawPhone.replace('@s.whatsapp.net', '').replace(/\D/g, '');

    if (!phone) {
      console.error('[WEBHOOK] Não foi possível extrair telefone do payload');
      return res.status(400).json({ error: 'Telefone não encontrado' });
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${phone}: "${text}"`);

    // Log all chat fields to discover photo/name fields from UAZAPI payload
    const chatRaw = payload.chat as unknown as Record<string, unknown>
    const photoFields = Object.entries(chatRaw).filter(([k]) =>
      /pic|photo|img|image|avatar|thumb|profile/i.test(k) && chatRaw[k]
    )
    if (photoFields.length) console.log('[WEBHOOK] Campos de foto encontrados:', photoFields)

    // Salva nome do contato do WhatsApp se o paciente ainda não tem nome
    const contactName = chatRaw?.name as string | undefined
      || chatRaw?.lead_name as string | undefined
      || (payload.chat as { pushName?: string })?.pushName
      || null
    if (contactName) {
      supabase.from('pacientes')
        .update({ nome: contactName })
        .eq('telefone', phone)
        .is('nome', null)
        .then(() => {})
    }

    debounceBuffer.addMessage(phone, text, (msgs) => procesarMensagens(phone, msgs));

    res.json({ success: true, id: payload.message?.messageid });
  } catch (error) {
    console.error('[WEBHOOK] Erro:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

export default router;
