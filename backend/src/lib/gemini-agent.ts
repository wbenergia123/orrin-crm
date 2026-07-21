import { GoogleGenAI } from '@google/genai'
import type Anthropic from '@anthropic-ai/sdk'
import { converterToolsParaGemini } from './gemini-tools-convert'
import { registrarFalhaTecnica, type ConversaHistorico } from './claude-agent'

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const MAX_ITERATIONS = 10

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{
    text?: string
    functionCall?: { name: string; args: Record<string, unknown> }
    functionResponse?: { name: string; response: Record<string, unknown> }
  }>
}

// Constrói o histórico inicial no formato de `contents` do Gemini a partir do
// mesmo `historico` neutro que claude-agent.ts já usa (mensagem_paciente /
// mensagem_agente), mais as mensagens novas do usuário nesta rodada.
export function construirContentsIniciais(
  historico: ConversaHistorico[],
  mensagensDoUsuario: string[]
): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const turno of historico) {
    if (turno.mensagem_paciente) {
      contents.push({ role: 'user', parts: [{ text: turno.mensagem_paciente }] })
    }
    if (turno.mensagem_agente) {
      contents.push({ role: 'model', parts: [{ text: turno.mensagem_agente }] })
    }
  }

  contents.push({ role: 'user', parts: [{ text: mensagensDoUsuario.join('\n') }] })
  return contents
}

interface ProcessarGeminiParams {
  tenantId: string
  pacienteId: string
  modelo: string
  systemPrompt: string
  tools: Anthropic.Tool[]
  historico: ConversaHistorico[]
  mensagensDoUsuario: string[]
  executarToolDispatcher: (
    tenantId: string,
    pacienteId: string,
    nome: string,
    input: Record<string, unknown>
  ) => Promise<object>
}

export async function processarComGemini({
  tenantId,
  pacienteId,
  modelo,
  systemPrompt,
  tools,
  historico,
  mensagensDoUsuario,
  executarToolDispatcher,
}: ProcessarGeminiParams): Promise<string> {
  try {
    const contents = construirContentsIniciais(historico, mensagensDoUsuario)
    const functionDeclarations = converterToolsParaGemini(tools)

    let consecutiveToolFailures = 0

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.models.generateContent({
        model: modelo,
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        },
      })

      const chamadas = response.functionCalls ?? []

      if (chamadas.length === 0) {
        const texto = (response.text ?? '').trim()
        if (!texto) return 'Desculpe, não consegui responder agora. Nossa equipe vai ajudar em breve.'
        return texto
      }

      contents.push({
        role: 'model',
        parts: chamadas.map((c) => ({ functionCall: { name: c.name!, args: c.args ?? {} } })),
      })

      const respostasFuncao: GeminiContent['parts'] = []

      for (const chamada of chamadas) {
        console.log(`[GEMINI] Tool chamada: ${chamada.name}`, chamada.args)
        try {
          const resultado = await executarToolDispatcher(
            tenantId,
            pacienteId,
            chamada.name!,
            (chamada.args ?? {}) as Record<string, unknown>
          )
          consecutiveToolFailures = 0
          respostasFuncao.push({ functionResponse: { name: chamada.name!, response: { resultado } } })
        } catch (err) {
          consecutiveToolFailures++
          console.error(`[GEMINI] Tool ${chamada.name} falhou (${consecutiveToolFailures}):`, err)
          respostasFuncao.push({
            functionResponse: { name: chamada.name!, response: { erro: 'Falha ao executar ferramenta', detalhes: String(err) } },
          })

          if (consecutiveToolFailures >= 3) {
            await registrarFalhaTecnica(pacienteId, tenantId)
            return 'Desculpe, estou com dificuldades técnicas agora. Nossa equipe vai entrar em contato em breve.'
          }
        }
      }

      contents.push({ role: 'user', parts: respostasFuncao })
    }

    console.warn(`[GEMINI] Máximo de ${MAX_ITERATIONS} iterações atingido para paciente ${pacienteId}`)
    await registrarFalhaTecnica(pacienteId, tenantId)
    return 'Desculpe, não consegui processar sua mensagem agora. Nossa equipe vai te ajudar em breve.'
  } catch (error) {
    console.error('[GEMINI] Erro irrecuperável no agentic loop:', error)
    await registrarFalhaTecnica(pacienteId, tenantId).catch(() => {})
    return 'Desculpe, estou com dificuldades técnicas agora. Nossa equipe vai entrar em contato em breve.'
  }
}
