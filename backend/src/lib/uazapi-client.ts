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
