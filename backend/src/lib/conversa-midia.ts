import { supabaseAdmin } from '../services/supabase'
import { getUazapiConfig } from './uazapi-client'

const BUCKET = 'fotos-pacientes'
const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
}

interface SalvarMidiaParams {
  tenantId: string
  pacienteId: string
  base64: string
  mimeType: string
  tipo: 'image' | 'video'
}

export async function salvarMidiaConversa({
  tenantId,
  pacienteId,
  base64,
  mimeType,
  tipo,
}: SalvarMidiaParams): Promise<string> {
  if (tipo !== 'image' && tipo !== 'video') {
    throw new Error('tipo de mídia inválido')
  }

  const ext = EXTENSAO_POR_MIME[mimeType] ?? (tipo === 'image' ? 'jpg' : 'mp4')
  const path = `${tenantId}/${pacienteId}/conversa-${Date.now()}.${ext}`
  const buffer = Buffer.from(base64, 'base64')

  const MAX_BUFFER_SIZE = 20 * 1024 * 1024 // 20 MB — WhatsApp media ceiling with margin
  if (buffer.length > MAX_BUFFER_SIZE) {
    throw new Error(`Arquivo muito grande (máx. 20MB, recebido ${Math.round(buffer.length / 1024 / 1024)}MB)`)
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType })
  if (uploadError) throw uploadError

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

interface MidiaBaixada {
  base64: string
  mimeType: string
}

// Baixa uma mídia (foto ou vídeo) da UAZAPI a partir do id da mensagem.
// Mesmo endpoint já usado pra áudio em routes/webhook.ts — devolve base64 + mimetype.
export async function baixarMidiaUazapi(
  tenantId: string,
  msgId: string
): Promise<MidiaBaixada | null> {
  const config = await getUazapiConfig(tenantId)
  if (!config) {
    console.warn(`[CONVERSA_MIDIA] Configuração UAZAPI não encontrada para tenant ${tenantId}`)
    return null
  }

  const res = await fetch(`${config.baseUrl}/message/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: config.token },
    body: JSON.stringify({ id: msgId, return_base64: true }),
  })
  if (!res.ok) {
    console.warn(`[CONVERSA_MIDIA] HTTP ${res.status} ao baixar mídia da UAZAPI para tenant ${tenantId}`)
    return null
  }

  const body = (await res.json()) as Record<string, unknown>
  const base64 = (body.base64Data || body.base64) as string | undefined
  const mimeType = (body.mimetype || body.mimeType) as string | undefined
  if (!base64 || !mimeType) {
    console.warn(`[CONVERSA_MIDIA] Resposta UAZAPI sem base64 ou mimeType para tenant ${tenantId}`)
    return null
  }

  return { base64, mimeType }
}
