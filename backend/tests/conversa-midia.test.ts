import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest'
import { salvarMidiaConversa, baixarMidiaUazapi } from '../src/lib/conversa-midia'
import { supabaseAdmin } from '../src/services/supabase'

vi.mock('../src/lib/uazapi-client', () => ({
  getUazapiConfig: vi.fn(),
}))

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

  it('rejeita arquivo acima de 20MB', async () => {
    const largaBase64 = Buffer.alloc(21 * 1024 * 1024).toString('base64')
    await expect(
      salvarMidiaConversa({
        tenantId: TENANT_ID_FAKE,
        pacienteId: PACIENTE_ID_FAKE,
        base64: largaBase64,
        mimeType: 'image/jpeg',
        tipo: 'image',
      })
    ).rejects.toThrow(/muito grande/)
  })
})

describe('baixarMidiaUazapi', () => {
  let mockFetch: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.spyOn(global, 'fetch' as any)
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('retorna base64 e mimeType com sucesso', async () => {
    const { getUazapiConfig } = await import('../src/lib/uazapi-client')
    vi.mocked(getUazapiConfig).mockResolvedValueOnce({
      baseUrl: 'https://api.uazapi.test',
      token: 'test-token',
      tenantId: TENANT_ID_FAKE,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        base64Data: PNG_1X1_BASE64,
        mimetype: 'image/png',
      }),
    })

    const result = await baixarMidiaUazapi(TENANT_ID_FAKE, 'msg-123')
    expect(result).toEqual({
      base64: PNG_1X1_BASE64,
      mimeType: 'image/png',
    })
    expect(mockFetch).toHaveBeenCalledWith('https://api.uazapi.test/message/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: 'test-token' },
      body: JSON.stringify({ id: 'msg-123', return_base64: true }),
    })
  })

  it('retorna null quando config UAZAPI não encontrada', async () => {
    const { getUazapiConfig } = await import('../src/lib/uazapi-client')
    vi.mocked(getUazapiConfig).mockResolvedValueOnce(null)

    const result = await baixarMidiaUazapi(TENANT_ID_FAKE, 'msg-123')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('retorna null quando HTTP status não é ok', async () => {
    const { getUazapiConfig } = await import('../src/lib/uazapi-client')
    vi.mocked(getUazapiConfig).mockResolvedValueOnce({
      baseUrl: 'https://api.uazapi.test',
      token: 'test-token',
      tenantId: TENANT_ID_FAKE,
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const result = await baixarMidiaUazapi(TENANT_ID_FAKE, 'msg-123')
    expect(result).toBeNull()
  })

  it('retorna null quando resposta não tem base64 ou mimeType', async () => {
    const { getUazapiConfig } = await import('../src/lib/uazapi-client')
    vi.mocked(getUazapiConfig).mockResolvedValueOnce({
      baseUrl: 'https://api.uazapi.test',
      token: 'test-token',
      tenantId: TENANT_ID_FAKE,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ incomplete: 'response' }),
    })

    const result = await baixarMidiaUazapi(TENANT_ID_FAKE, 'msg-123')
    expect(result).toBeNull()
  })
})
