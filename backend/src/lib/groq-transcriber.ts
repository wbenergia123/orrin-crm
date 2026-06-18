// Transcreve áudio usando Groq Whisper

export async function transcreverAudio(audioBase64: string, mimetype: string): Promise<string | null> {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      console.error('[GROQ] GROQ_API_KEY não configurada')
      return null
    }

    // Converte base64 para buffer e cria um Blob
    const buffer = Buffer.from(audioBase64, 'base64')

    // Determina extensão pelo mimetype
    const ext = mimetype.includes('ogg') ? 'ogg'
      : mimetype.includes('mp3') ? 'mp3'
      : mimetype.includes('mp4') ? 'mp4'
      : mimetype.includes('webm') ? 'webm'
      : 'ogg'

    const blob = new Blob([buffer], { type: mimetype || 'audio/ogg' })

    const formData = new FormData()
    formData.append('file', blob, `audio.${ext}`)
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('language', 'pt')
    formData.append('response_format', 'json')

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const err = await response.text()
      console.error(`[GROQ] Erro na transcrição: ${response.status} — ${err}`)
      return null
    }

    const result = await response.json() as { text: string }
    console.log(`[GROQ] Transcrição: "${result.text}"`)
    return result.text
  } catch (error) {
    console.error('[GROQ] Erro ao transcrever:', error)
    return null
  }
}
