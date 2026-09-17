import { describe, it, expect, vi } from 'vitest'

const generateContentMock = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
}))

const { construirContentsIniciais, processarComGemini } = await import('../src/lib/gemini-agent')

describe('construirContentsIniciais', () => {
  it('intercala histórico paciente/agente em contents user/model', () => {
    const contents = construirContentsIniciais(
      [
        { mensagem_paciente: 'Oi, quero saber sobre ripado', mensagem_agente: null },
        { mensagem_paciente: null, mensagem_agente: 'Claro! Me conta mais sobre o telhado.' },
      ],
      ['Tem 40 metros quadrados']
    )

    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi, quero saber sobre ripado' }] },
      { role: 'model', parts: [{ text: 'Claro! Me conta mais sobre o telhado.' }] },
      { role: 'user', parts: [{ text: 'Tem 40 metros quadrados' }] },
    ])
  })

  it('sem histórico, só a mensagem atual', () => {
    const contents = construirContentsIniciais([], ['Oi'])
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'Oi' }] }])
  })
})

describe('processarComGemini', () => {
  it('executa a tool chamada pelo Gemini e retorna o texto final da segunda rodada', async () => {
    generateContentMock
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'buscar_paciente', args: { id: '123' } }],
        text: undefined,
      })
      .mockResolvedValueOnce({
        functionCalls: [],
        text: 'Encontrei seu cadastro, tudo certo!',
      })

    const executarToolDispatcher = vi.fn().mockResolvedValue({ ok: true })

    const resultado = await processarComGemini({
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      modelo: 'gemini-2.0-flash',
      systemPrompt: 'você é um agente',
      tools: [],
      historico: [],
      mensagensDoUsuario: ['Oi'],
      executarToolDispatcher,
    })

    expect(executarToolDispatcher).toHaveBeenCalledWith('tenant-1', 'paciente-1', 'buscar_paciente', { id: '123' })
    expect(resultado).toBe('Encontrei seu cadastro, tudo certo!')
  })

  it('devolve o thoughtSignature do functionCall no histórico da rodada seguinte', async () => {
    const partsDoModelo = [
      { thoughtSignature: 'assinatura-abc', functionCall: { name: 'atualizar_cliente', args: { nome: 'Willian' } } },
    ]

    generateContentMock.mockReset()
    generateContentMock
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'atualizar_cliente', args: { nome: 'Willian' } }],
        candidates: [{ content: { role: 'model', parts: partsDoModelo } }],
        text: undefined,
      })
      .mockResolvedValueOnce({ functionCalls: [], text: 'Prazer, Willian!' })

    await processarComGemini({
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      modelo: 'gemini-3.1-flash-lite',
      systemPrompt: 'você é um agente',
      tools: [],
      historico: [],
      mensagensDoUsuario: ['Willian'],
      executarToolDispatcher: vi.fn().mockResolvedValue({ ok: true }),
    })

    const contentsDaSegundaRodada = generateContentMock.mock.calls[1][0].contents
    expect(contentsDaSegundaRodada).toContainEqual({ role: 'model', parts: partsDoModelo })
  })

  describe('sobrecarga do Google', () => {
    const params = () => ({
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      modelo: 'gemini-3.1-flash-lite',
      systemPrompt: 'você é um agente',
      tools: [],
      historico: [],
      mensagensDoUsuario: ['Ola'],
      executarToolDispatcher: vi.fn(),
    })
    const erro = (status: number) => Object.assign(new Error(`status ${status}`), { status })

    it('503 passageiro: espera, tenta de novo e responde', async () => {
      vi.useFakeTimers()
      generateContentMock.mockReset()
      generateContentMock
        .mockRejectedValueOnce(erro(503))
        .mockRejectedValueOnce(erro(429))
        .mockResolvedValueOnce({ functionCalls: [], text: 'Oi! Sou a Ana.' })

      const p = processarComGemini(params())
      await vi.runAllTimersAsync()
      expect(await p).toBe('Oi! Sou a Ana.')
      expect(generateContentMock).toHaveBeenCalledTimes(3)
      vi.useRealTimers()
    })

    it('503 que não passa: desiste depois de 3 tentativas', async () => {
      vi.useFakeTimers()
      generateContentMock.mockReset()
      generateContentMock.mockRejectedValue(erro(503))

      const p = processarComGemini(params())
      await vi.runAllTimersAsync()
      expect(await p).toBe('')
      expect(generateContentMock).toHaveBeenCalledTimes(3)
      vi.useRealTimers()
    })

    it('erro que não é sobrecarga (400) não repete', async () => {
      generateContentMock.mockReset()
      generateContentMock.mockRejectedValue(erro(400))

      expect(await processarComGemini(params())).toBe('')
      expect(generateContentMock).toHaveBeenCalledTimes(1)
    })
  })
})
