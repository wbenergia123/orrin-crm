// Cliente para enviar mensagens via UAZAPI por tenant
import { supabaseAdmin } from '../services/supabase'

export interface UazapiConfig {
  baseUrl: string
  token: string
}

export async function getUazapiConfig(tenantId: string): Promise<UazapiConfig | null> {
  const { data: rows } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor')
    .eq('tenant_id', tenantId)
    .in('chave', ['uazapi_url', 'uazapi_token'])

  const map = Object.fromEntries((rows ?? []).map((r) => [r.chave, r.valor]))
  const baseUrl = map['uazapi_url']
  const token = map['uazapi_token']

  // Fallback temporário pro env enquanto a Clínica Teste não tem config própria em "configuracoes"
  if (!baseUrl) {
    return process.env.UAZAPI_URL
      ? { baseUrl: process.env.UAZAPI_URL, token: process.env.UAZAPI_TOKEN || '' }
      : null
  }

  return { baseUrl, token: token || '' }
}

interface SendMessageParams {
  tenantId: string
  phone: string
  text: string
}

export async function enviarMensagemViaUAZAPI({
  tenantId,
  phone,
  text,
}: SendMessageParams): Promise<boolean> {
  const config = await getUazapiConfig(tenantId)
  if (!config) {
    console.error(`[UAZAPI] Configuração não encontrada para tenant ${tenantId}`)
    return false
  }

  return enviarMensagemComConfig(config, phone, text)
}

// Formato confirmado contra a instância: POST /send/media aceita a imagem por URL
// pública (não precisa base64) e a legenda no campo `text`.
export async function enviarImagemViaUAZAPI({
  tenantId,
  phone,
  imagemUrl,
  legenda,
}: {
  tenantId: string
  phone: string
  imagemUrl: string
  legenda?: string
}): Promise<boolean> {
  const config = await getUazapiConfig(tenantId)
  if (!config) {
    console.error(`[UAZAPI] Configuração não encontrada para tenant ${tenantId}`)
    return false
  }

  try {
    const response = await fetch(`${config.baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: config.token },
      body: JSON.stringify({
        number: phone.replace(/\D/g, ''),
        type: 'image',
        file: imagemUrl,
        text: legenda ?? '',
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[UAZAPI] Erro ao enviar imagem: ${response.status} — ${body}`)
      return false
    }

    console.log(`[UAZAPI] Imagem enviada para ${phone}`)
    return true
  } catch (error) {
    console.error('[UAZAPI] Erro ao enviar imagem:', error)
    return false
  }
}

export async function enviarMensagemComConfig(
  config: UazapiConfig,
  phone: string,
  text: string
): Promise<boolean> {
  try {
    const number = phone.replace(/\D/g, '')

    const response = await fetch(`${config.baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': config.token,
      },
      body: JSON.stringify({ number, text }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[UAZAPI] Erro ao enviar: ${response.status} ${response.statusText} — ${body}`)
      return false
    }

    console.log(`[UAZAPI] Mensagem enviada para ${phone}`)
    return true
  } catch (error) {
    console.error('[UAZAPI] Erro ao enviar mensagem:', error)
    return false
  }
}
