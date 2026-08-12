// Orçamento de painel ripado WPC (tenant Floripa Revest).
//
// Ligado por tenant pela config `orcamento_wpc` — a Agrokhan divide o vertical
// agro e não pode ganhar nem a tool nem a liberação de preço.
// A conta mora aqui, em código, e não no prompt: o modelo do vertical agro é um
// flash-lite, e arredondamento + escolha de barra + frete é regra determinística.
// Mesma decisão da Fase 1 do notificar-consultor.
import { supabase } from '../db/supabase'
import type Anthropic from '@anthropic-ai/sdk'
import { executarToolAgro } from './claude-tools-agro'
import { enviarImagemViaUAZAPI } from './uazapi-client'

// Tudo em centavos — 79.90 * 8 em float dá 639.2000000000001.
const PRECO_PAINEL = 7990          // só material
const PRECO_PAINEL_INSTALADO = 10990 // material + mão de obra (parede); isenta frete
const PRECO_TUBO_PU = 2000
const PAINEIS_POR_TUBO_PU = 1.5

const DESCONTO_A_VISTA = 0.05
const PARCELAS_MAX = 6

const LARGURA_PAINEL_M = 0.16
const COMPRIMENTOS_M = [2.7, 2.8, 2.9] as const

// Cliente escreve "Floripa", não "Florianópolis". Apelido que não bate vira
// handoff pro vendedor — perde venda que a tabela sabia responder.
// Só apelido inequívoco entra aqui: na dúvida, handoff é melhor que frete errado.
const FRETE_POR_CIDADE: Record<string, number> = {
  biguacu: 4000,
  'sao jose': 3000,
  palhoca: 4000,
  florianopolis: 5000,
  floripa: 5000,
  fpolis: 5000,
}

function normalizarCidade(cidade: string): string {
  return cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    // "Florianópolis - SC", "São José/SC", "Palhoça SC" → tira o estado
    .replace(/[\s,]*[-/]?\s*sc$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function reais(centavos: number): string {
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function metros(m: number): string {
  return `${m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}m`
}

export interface OrcamentoInput {
  largura_m: number
  altura_m: number
  cidade?: string
  com_instalacao?: boolean
}

export type OrcamentoResultado =
  | { ok: false; motivo: 'medida_invalida' | 'altura_acima_do_padrao' | 'cidade_sem_frete'; mensagem: string }
  | {
      ok: true
      paineis: number
      comprimento_painel_m: number
      pecas: number
      pecas_por_painel: number
      tubos_pu: number
      com_instalacao: boolean
      frete_centavos: number
      total_centavos: number
      total_a_vista_centavos: number
      parcela_centavos: number
      mensagem: string
    }

export function calcularOrcamentoWpc(input: OrcamentoInput): OrcamentoResultado {
  const { largura_m, altura_m } = input
  const comInstalacao = input.com_instalacao === true

  if (!(largura_m > 0) || !(altura_m > 0) || largura_m > 50 || altura_m > 50) {
    return {
      ok: false,
      motivo: 'medida_invalida',
      mensagem: 'Medida inválida. Peça ao cliente a largura e a altura da parede em metros, separadas.',
    }
  }

  // Frete só entra em venda de material; com instalação a loja não cobra.
  let frete = 0
  if (!comInstalacao) {
    if (!input.cidade?.trim()) {
      return {
        ok: false,
        motivo: 'cidade_sem_frete',
        mensagem: 'Falta a cidade da entrega para calcular o frete. Pergunte ao cliente.',
      }
    }
    const encontrado = FRETE_POR_CIDADE[normalizarCidade(input.cidade)]
    if (encontrado === undefined) {
      return {
        ok: false,
        motivo: 'cidade_sem_frete',
        mensagem: `Não atendemos ${input.cidade.trim()} com frete de tabela. Passe o atendimento para um vendedor combinar a entrega.`,
      }
    }
    frete = encontrado
  }

  const pecas = Math.ceil(largura_m / LARGURA_PAINEL_M)

  // Cada painel rende N peças da altura da parede — é daí que vem o
  // "aproveitamento": parede baixa corta 2 peças de um painel só.
  let melhor: { comprimento: number; paineis: number; porPainel: number } | null = null
  for (const comprimento of COMPRIMENTOS_M) {
    const porPainel = Math.floor(comprimento / altura_m)
    if (porPainel < 1) continue
    const paineis = Math.ceil(pecas / porPainel)
    // Menos painéis ganha; empatou, leva o painel mais curto (menos sobra).
    if (!melhor || paineis < melhor.paineis) melhor = { comprimento, paineis, porPainel }
  }

  if (!melhor) {
    return {
      ok: false,
      motivo: 'altura_acima_do_padrao',
      mensagem: `Parede de ${metros(altura_m)} passa do painel mais alto (2,90m). Precisa de emenda — passe para um vendedor avaliar.`,
    }
  }

  const tubosPu = Math.ceil(melhor.paineis / PAINEIS_POR_TUBO_PU)
  const precoUnitario = comInstalacao ? PRECO_PAINEL_INSTALADO : PRECO_PAINEL
  const subtotalPaineis = melhor.paineis * precoUnitario
  const subtotalPu = tubosPu * PRECO_TUBO_PU
  const total = subtotalPaineis + subtotalPu + frete

  // Desconto sobre o total (frete incluso). Parcela sai do valor cheio, como é
  // praxe: quem parcela não leva o desconto do à vista.
  const aVista = Math.round(total * (1 - DESCONTO_A_VISTA))
  // Arredonda a parcela pra cima: 6 parcelas nunca podem somar menos que o total.
  const parcela = Math.ceil(total / PARCELAS_MAX)

  const painelLinha = comInstalacao
    ? `🔨 ${melhor.paineis} ${melhor.paineis === 1 ? 'painel instalado' : 'painéis instalados'}`
    : `🧱 ${melhor.paineis} ${melhor.paineis === 1 ? 'painel' : 'painéis'}`

  const linhas = [
    '💎 *Painel Ripado WPC*',
    '',
    `📐 Parede: ${metros(largura_m)} de largura x ${metros(altura_m)} de altura`,
    `📏 Painel: ${metros(melhor.comprimento)} x 16cm${melhor.porPainel > 1 ? ` *(cada um rende ${melhor.porPainel} peças)*` : ''}`,
    '',
    `${painelLinha}: ${reais(subtotalPaineis)}`,
    `🧴 ${tubosPu} ${tubosPu === 1 ? 'tubo' : 'tubos'} de cola PU: ${reais(subtotalPu)}`,
    comInstalacao ? '🚚 Frete: grátis *(incluso na instalação)*' : `🚚 Frete: ${reais(frete)}`,
    '',
    `💰 *Total: ${reais(total)}*`,
    `✅ *À vista com 5% de desconto: ${reais(aVista)}*`,
    `💳 Ou em até ${PARCELAS_MAX}x de ${reais(parcela)} sem juros`,
    '',
    '✨ WPC com acabamento moderno e sofisticado',
    '📲 Quer ver as opções de cor?',
  ]

  return {
    ok: true,
    paineis: melhor.paineis,
    comprimento_painel_m: melhor.comprimento,
    pecas,
    pecas_por_painel: melhor.porPainel,
    tubos_pu: tubosPu,
    com_instalacao: comInstalacao,
    frete_centavos: frete,
    total_centavos: total,
    total_a_vista_centavos: aVista,
    parcela_centavos: parcela,
    mensagem: linhas.join('\n'),
  }
}

// Gemini às vezes manda número como string ("2,40"); não vale derrubar a conta por isso.
function numero(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v.replace(',', '.'))
  return NaN
}

export async function executarToolAgroOuOrcamento(
  tenantId: string,
  pacienteId: string,
  name: string,
  input: Record<string, unknown>
): Promise<object> {
  if (name === TOOL_ENVIAR_FOTO_PRODUTO.name) {
    return enviarFotoProduto(tenantId, pacienteId, input)
  }
  if (name === TOOL_ORCAMENTO_WPC.name) {
    return calcularOrcamentoWpc({
      largura_m: numero(input.largura_m),
      altura_m: numero(input.altura_m),
      cidade: typeof input.cidade === 'string' ? input.cidade : undefined,
      com_instalacao: input.com_instalacao === true || input.com_instalacao === 'true',
    })
  }
  return executarToolAgro(tenantId, pacienteId, name, input)
}

export async function orcamentoWpcAtivo(tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('tenant_id', tenantId)
    .eq('chave', 'orcamento_wpc')
    .maybeSingle()
  return data?.valor?.trim() === 'true'
}

// A `atualizar_cliente` do vertical agro pede atividade rural e trator — e a Ana
// obedecia, perguntando de colheitadeira pra quem quer revestir a sala. A execução
// é a mesma (executarToolAgro grava os campos que vierem); só a descrição e os
// campos oferecidos mudam. A Agrokhan continua com a versão original.
const TOOL_ATUALIZAR_CLIENTE_REVEST: Anthropic.Tool = {
  name: 'atualizar_cliente',
  description: 'Salva os dados do cliente no cadastro: nome, cidade e o que ele está procurando. Use assim que o cliente informar qualquer um desses dados. NUNCA pergunte sobre atividade rural, plantação, trator ou maquinário.',
  input_schema: {
    type: 'object' as const,
    properties: {
      nome: { type: 'string', description: 'Nome do cliente' },
      cidade: { type: 'string', description: 'Cidade do cliente (usada também para o frete)' },
    },
    required: [],
  },
}

// Loja de balcão não agenda: a consultora liga quando puder. Deixar as tools de
// reunião disponíveis é convite pro modelo marcar horário que ninguém combinou —
// ainda mais com vendedora sem agenda configurada.
const TOOLS_DE_AGENDA = ['verificar_slots_vendedores', 'criar_reuniao', 'remarcar_reuniao', 'cancelar_reuniao']

export function ajustarToolsParaRevest(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools
    .filter((t) => !TOOLS_DE_AGENDA.includes(t.name))
    .map((t) => (t.name === TOOL_ATUALIZAR_CLIENTE_REVEST.name ? TOOL_ATUALIZAR_CLIENTE_REVEST : t))
}

export const TOOL_ENVIAR_FOTO_PRODUTO: Anthropic.Tool = {
  name: 'enviar_foto_produto',
  description:
    'Envia a foto de um produto do catálogo pro WhatsApp do cliente. Use quando ele pedir pra ver as cores, o acabamento ou como o produto é. A foto vai numa mensagem separada — depois de chamar, escreva um texto curto comentando. Só funciona para produto que tem foto no catálogo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      produto_id: { type: 'string', description: 'ID do produto no catálogo (a lista de IDs está no seu contexto)' },
      legenda: { type: 'string', description: 'Legenda curta que acompanha a foto, ex: "Essas são as 10 cores do Painel Ripado WPC"' },
    },
    required: ['produto_id'],
  },
}

// A tool envia a imagem por fora do fluxo de resposta: o agente devolve UMA
// mensagem de texto por interação, então a foto não caberia no retorno dele.
async function enviarFotoProduto(
  tenantId: string,
  pacienteId: string,
  input: Record<string, unknown>
): Promise<object> {
  const produtoId = typeof input.produto_id === 'string' ? input.produto_id : ''
  if (!produtoId) return { erro: 'produto_id é obrigatório' }

  const [{ data: produto }, { data: paciente }] = await Promise.all([
    supabase.from('produtos').select('nome, foto_url').eq('id', produtoId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('pacientes').select('telefone').eq('id', pacienteId).eq('tenant_id', tenantId).maybeSingle(),
  ])

  if (!produto) return { erro: 'Produto não encontrado no catálogo' }
  if (!produto.foto_url) {
    return { enviado: false, motivo: `${produto.nome} ainda não tem foto cadastrada. Ofereça chamar um vendedor.` }
  }
  if (!paciente?.telefone) return { erro: 'Cliente sem telefone' }

  const legenda = typeof input.legenda === 'string' ? input.legenda : undefined
  const enviado = await enviarImagemViaUAZAPI({
    tenantId,
    phone: paciente.telefone,
    imagemUrl: produto.foto_url,
    legenda,
  })

  return enviado
    ? { enviado: true, produto: produto.nome, aviso: 'A foto já foi enviada. Agora escreva o texto que acompanha.' }
    : { enviado: false, motivo: 'Falha ao enviar a foto. Ofereça chamar um vendedor.' }
}

export const TOOL_ORCAMENTO_WPC: Anthropic.Tool = {
  name: 'calcular_orcamento_wpc',
  description:
    'Calcula o orçamento fechado de painel ripado WPC para uma parede. Use SEMPRE que tiver largura e altura — nunca faça a conta de cabeça. Devolve o texto pronto do orçamento no campo "mensagem": envie ele ao cliente como está. Só serve para PAREDE; forro/teto exige visita técnica.',
  input_schema: {
    type: 'object' as const,
    properties: {
      largura_m: { type: 'number', description: 'Largura da parede em metros (o lado horizontal). Confirme com o cliente qual medida é a largura antes de chamar.' },
      altura_m: { type: 'number', description: 'Altura da parede em metros (do chão ao teto).' },
      com_instalacao: { type: 'boolean', description: 'true se o cliente quer a instalação junto (nesse caso não há frete). false ou omitido = só material.' },
      cidade: { type: 'string', description: 'Cidade da entrega. Obrigatória quando NÃO tem instalação, para calcular o frete.' },
    },
    required: ['largura_m', 'altura_m'],
  },
}
