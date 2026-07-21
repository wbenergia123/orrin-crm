import { describe, it, expect, afterAll } from 'vitest'
import { salvarMidiaConversa } from '../src/lib/conversa-midia'
import { supabaseAdmin } from '../src/services/supabase'

const TENANT_ID_FAKE = '00000000-0000-0000-0000-000000000001'
const PACIENTE_ID_FAKE = '00000000-0000-0000-0000-000000000002'

// PNG 1x1 transparente, só pra ter bytes válidos de imagem
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let pathCriado: string | null = null

afterAll(async () => {
  if (pathCriado) await supabaseAdmin.storage.from('fotos-pacientes').remove([pathCriado])
})

describe('salvarMidiaConversa', () => {
  it('sobe a mídia e retorna uma URL pública', async () => {
    const url = await salvarMidiaConversa({
      tenantId: TENANT_ID_FAKE,
      pacienteId: PACIENTE_ID_FAKE,
      base64: PNG_1X1_BASE64,
      mimeType: 'image/png',
      tipo: 'image',
    })

    expect(url).toMatch(/^https?:\/\//)
    expect(url).toContain('fotos-pacientes')

    // extrai o path pra poder limpar depois
    const match = url.match(/fotos-pacientes\/(.+)$/)
    pathCriado = match ? match[1] : null
  })

  it('rejeita tipo de mídia inválido', async () => {
    await expect(
      salvarMidiaConversa({
        tenantId: TENANT_ID_FAKE,
        pacienteId: PACIENTE_ID_FAKE,
        base64: PNG_1X1_BASE64,
        mimeType: 'image/png',
        // @ts-expect-error testando valor inválido de propósito
        tipo: 'audio',
      })
    ).rejects.toThrow('tipo de mídia inválido')
  })
})
