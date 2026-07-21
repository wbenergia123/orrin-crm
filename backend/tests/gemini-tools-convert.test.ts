import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { converterToolsParaGemini } from '../src/lib/gemini-tools-convert'

const TOOLS_EXEMPLO: Anthropic.Tool[] = [
  {
    name: 'atualizar_paciente',
    description: 'Salva o nome do paciente.',
    input_schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome completo' } },
      required: ['nome'],
    },
  },
  {
    name: 'criar_reuniao',
    description: 'Cria uma reunião.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['presencial', 'virtual'], description: 'Tipo' },
      },
      required: [],
    },
  },
]

describe('converterToolsParaGemini', () => {
  it('preserva nome, descrição e schema de parâmetros', () => {
    const convertido = converterToolsParaGemini(TOOLS_EXEMPLO)

    expect(convertido).toHaveLength(2)
    expect(convertido[0].name).toBe('atualizar_paciente')
    expect(convertido[0].description).toBe('Salva o nome do paciente.')
    expect(convertido[0].parametersJsonSchema).toEqual(TOOLS_EXEMPLO[0].input_schema)
  })

  it('preserva enum dentro do schema', () => {
    const convertido = converterToolsParaGemini(TOOLS_EXEMPLO)
    const propsTipo = (convertido[1].parametersJsonSchema as any).properties.tipo
    expect(propsTipo.enum).toEqual(['presencial', 'virtual'])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(converterToolsParaGemini([])).toEqual([])
  })
})
