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
})
