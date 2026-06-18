// Cliente para enviar mensagens via UAZAPI

interface SendMessageParams {
  phone: string
  text: string
}

export async function enviarMensagemViaUAZAPI({
  phone,
  text,
}: SendMessageParams): Promise<boolean> {
  try {
    const token = process.env.UAZAPI_TOKEN
    // UAZAPI_URL deve ser a URL base da instância, ex: https://minha-instancia.uazapi.com
    const baseUrl = process.env.UAZAPI_URL

    if (!baseUrl) {
      console.error('[UAZAPI] UAZAPI_URL não configurada')
      return false
    }

    const number = phone.replace(/\D/g, '')

    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token || '',
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
