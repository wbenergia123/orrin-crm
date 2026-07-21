import type Anthropic from '@anthropic-ai/sdk'

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parametersJsonSchema: unknown
}

// input_schema (Anthropic) e parametersJsonSchema (Gemini) usam o mesmo
// formato de JSON Schema — as tools deste projeto só usam type/properties/
// required/description/enum, todos suportados pelos dois. Conversão 1:1,
// sem duplicar as definições de tools em dois arquivos.
export function converterToolsParaGemini(
  tools: Anthropic.Tool[]
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parametersJsonSchema: tool.input_schema,
  }))
}
