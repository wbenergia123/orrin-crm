import { describe, it, expect } from 'vitest'
import { construirContentsIniciais } from '../src/lib/gemini-agent'

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
