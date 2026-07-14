// backend/src/lib/claude-tools-agro.ts
import { supabase } from '../db/supabase'
import type Anthropic from '@anthropic-ai/sdk'
import { calcularDisponibilidade } from './disponibilidade'
import { formatarTextoLocal } from './datetime-local'

export const TOOLS_AGRO: Anthropic.Tool[] = [
  {
    name: 'atualizar_cliente',
    description: 'Salva dados do cliente no cadastro: nome, cidade, atividade (soja, milho, pecuária...) e máquinas que possui (trator/colheitadeira, marca e modelo). Use assim que o cliente informar qualquer um desses dados.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: { type: 'string', description: 'Nome completo do cliente' },
        cidade: { type: 'string', description: 'Cidade/região do cliente' },
        atividade: { type: 'string', description: 'Atividade rural: soja, milho, pecuária, etc.' },
        maquinas: { type: 'string', description: 'Máquinas que o cliente possui (marca e modelo)' },
      },
      required: [],
    },
  },
  {
    name: 'listar_produtos',
    description: 'Lista o catálogo de implementos da empresa (nome, categoria, descrição). Use para saber o que oferecer e para identificar o produto de interesse do cliente. NUNCA informe preço — orçamentos são personalizados e tratados na reunião.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'registrar_interesse',
    description: 'Registra o produto de interesse do cliente no cadastro. Use quando o cliente demonstrar interesse em um implemento específico do catálogo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        produto_id: { type: 'string', description: 'UUID do produto (obtido via listar_produtos)' },
      },
      required: ['produto_id'],
    },
  },
  {
    name: 'verificar_slots_vendedores',
    description: 'Retorna horários disponíveis dos vendedores para reunião. Use data_inicio e data_fim (YYYY-MM-DD). profissional_id é opcional — omita para ver todos os vendedores.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data final YYYY-MM-DD' },
        profissional_id: { type: 'string', description: 'UUID do vendedor (opcional)' },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
  {
    name: 'criar_reuniao',
    description: 'Cria uma reunião (presencial ou virtual) entre o cliente e um vendedor. Chame APENAS após confirmação explícita do cliente sobre dia/hora e tipo. Reunião virtual exige link_reuniao — se não tiver um link, crie como presencial e a equipe envia o link depois.',
    input_schema: {
      type: 'object' as const,
      properties: {
        profissional_id: { type: 'string', description: 'UUID do vendedor' },
        data_hora: { type: 'string', description: 'ISO 8601 sem timezone, ex: 2026-07-21T09:00:00' },
        tipo: { type: 'string', enum: ['presencial', 'virtual'], description: 'Tipo da reunião' },
        link_reuniao: { type: 'string', description: 'Link da chamada (obrigatório se virtual)' },
        local: { type: 'string', description: 'Local do encontro (se presencial)' },
        notas: { type: 'string', description: 'Observações' },
      },
      required: ['profissional_id', 'data_hora', 'tipo'],
    },
  },
  {
    name: 'remarcar_reuniao',
    description: 'Muda a data/hora de uma reunião existente. Chame APENAS após confirmação explícita do cliente sobre o novo horário.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reuniao_id: { type: 'string', description: 'UUID da reunião' },
        data_hora: { type: 'string', description: 'Nova data/hora ISO 8601 sem timezone' },
      },
      required: ['reuniao_id', 'data_hora'],
    },
  },
  {
    name: 'cancelar_reuniao',
    description: 'Cancela uma reunião a pedido do cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reuniao_id: { type: 'string', description: 'UUID da reunião' },
      },
      required: ['reuniao_id'],
    },
  },
]

async function atualizarCliente(pacienteId: string, input: Record<string, unknown>) {
  const updates: Record<string, string> = {}
  for (const campo of ['nome', 'cidade', 'atividade', 'maquinas'] as const) {
    if (typeof input[campo] === 'string' && (input[campo] as string).trim()) {
      updates[campo] = (input[campo] as string).trim()
    }
  }
  if (Object.keys(updates).length === 0) return { sucesso: false, erro: 'nenhum campo informado' }
  const { error } = await supabase.from('pacientes').update(updates).eq('id', pacienteId)
  if (error) throw error
  return { sucesso: true }
}

async function listarProdutos(tenantId: string) {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, categoria, descricao')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('nome')
  if (error) throw error
  return { produtos: data ?? [] }
}

async function registrarInteresse(tenantId: string, pacienteId: string, produtoId: string) {
  const { data: produto } = await supabase
    .from('produtos')
    .select('nome')
    .eq('id', produtoId)
    .eq('tenant_id', tenantId)
    .single()
  if (!produto) return { sucesso: false, erro: 'produto não encontrado' }
  const { error } = await supabase
    .from('pacientes')
    .update({ produto_interesse_id: produtoId })
    .eq('id', pacienteId)
  if (error) throw error
  return { sucesso: true, produto: produto.nome }
}

async function verificarSlotsVendedores(
  tenantId: string,
  input: { data_inicio: string; data_fim: string; profissional_id?: string }
) {
  let query = supabase
    .from('profissionais')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('nome')
  if (input.profissional_id) query = query.eq('id', input.profissional_id)
  const { data: vendedores, error } = await query
  if (error) throw error
  if (!vendedores?.length) return { disponibilidade: [] }

  const ids = vendedores.map((v) => v.id)
  const [{ data: reunioes }, { data: bloqueios }] = await Promise.all([
    supabase
      .from('reunioes_agro')
      .select('profissional_id, data_hora')
      .eq('tenant_id', tenantId)
      .in('profissional_id', ids)
      .neq('status', 'cancelada')
      .gte('data_hora', `${input.data_inicio}T00:00:00`)
      .lte('data_hora', `${input.data_fim}T23:59:59`),
    supabase
      .from('bloqueios_agenda')
      .select('profissional_id, data_hora_inicio, data_hora_fim')
      .eq('tenant_id', tenantId)
      .in('profissional_id', ids)
      .lte('data_hora_inicio', `${input.data_fim}T23:59:59`)
      .gte('data_hora_fim', `${input.data_inicio}T00:00:00`),
  ])

  return {
    disponibilidade: calcularDisponibilidade(
      vendedores,
      (reunioes ?? []).filter((r) => r.profissional_id) as { profissional_id: string; data_hora: string }[],
      bloqueios ?? [],
      input.data_inicio,
      input.data_fim
    ),
  }
}

async function criarReuniao(tenantId: string, pacienteId: string, input: Record<string, unknown>) {
  const tipo = input.tipo === 'virtual' ? 'virtual' : 'presencial'
  const link = typeof input.link_reuniao === 'string' ? input.link_reuniao.trim() : ''
  if (tipo === 'virtual' && !link) {
    return { sucesso: false, erro: 'link_obrigatorio', mensagem: 'Reunião virtual exige um link. Crie como presencial ou informe o link.' }
  }
  const dataHoraNorm = String(input.data_hora).replace(/(Z|[+-]\d{2}:\d{2})$/, '')

  // Double-booking: mesmo vendedor, mesmo horário
  const { data: existente } = await supabase
    .from('reunioes_agro')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('profissional_id', input.profissional_id as string)
    .eq('data_hora', dataHoraNorm)
    .neq('status', 'cancelada')
    .limit(1)
    .single()
  if (existente) {
    return { sucesso: false, erro: 'slot_ocupado', mensagem: 'Esse horário acabou de ser ocupado. Chame verificar_slots_vendedores novamente.' }
  }

  const { data, error } = await supabase
    .from('reunioes_agro')
    .insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      profissional_id: input.profissional_id as string,
      data_hora: dataHoraNorm,
      tipo,
      link_reuniao: link || null,
      local: (input.local as string) ?? null,
      notas: (input.notas as string) ?? null,
      status: 'agendada',
    })
    .select('id')
    .single()
  if (error) throw error

  await supabase
    .from('pacientes')
    .update({ status: 'reuniao_agendada' })
    .eq('id', pacienteId)
    .eq('tenant_id', tenantId)
    .in('status', ['novo', 'em_conversa'])

  const { data: dataStr, hora } = formatarTextoLocal(dataHoraNorm)
  const [ano, mes, dia] = dataStr.split('-').map(Number)
  const dataFormatada = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return { sucesso: true, reuniao_id: data.id, data_hora_confirmada: `${dataFormatada} às ${hora}`, tipo }
}

async function remarcarReuniao(tenantId: string, pacienteId: string, input: Record<string, unknown>) {
  const dataHoraNorm = String(input.data_hora).replace(/(Z|[+-]\d{2}:\d{2})$/, '')
  const { data: original } = await supabase
    .from('reunioes_agro')
    .select('id, status, profissional_id')
    .eq('id', input.reuniao_id as string)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)
    .single()
  if (!original || original.status === 'cancelada') {
    return { sucesso: false, erro: 'nao_encontrado', mensagem: 'Reunião não encontrada ou já cancelada.' }
  }
  const { error } = await supabase
    .from('reunioes_agro')
    .update({ data_hora: dataHoraNorm, status: 'agendada' })
    .eq('id', original.id)
    .eq('tenant_id', tenantId)
  if (error) throw error
  return { sucesso: true }
}

async function cancelarReuniao(tenantId: string, pacienteId: string, reuniaoId: string) {
  const { error } = await supabase
    .from('reunioes_agro')
    .update({ status: 'cancelada' })
    .eq('id', reuniaoId)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)
  if (error) throw error
  return { sucesso: true }
}

export async function executarToolAgro(
  tenantId: string,
  pacienteId: string,
  name: string,
  input: Record<string, unknown>
): Promise<object> {
  switch (name) {
    case 'atualizar_cliente':
      return atualizarCliente(pacienteId, input)
    case 'listar_produtos':
      return listarProdutos(tenantId)
    case 'registrar_interesse':
      return registrarInteresse(tenantId, pacienteId, (input.produto_id as string) ?? '')
    case 'verificar_slots_vendedores':
      return verificarSlotsVendedores(tenantId, input as { data_inicio: string; data_fim: string; profissional_id?: string })
    case 'criar_reuniao':
      return criarReuniao(tenantId, pacienteId, input)
    case 'remarcar_reuniao':
      return remarcarReuniao(tenantId, pacienteId, input)
    case 'cancelar_reuniao':
      return cancelarReuniao(tenantId, pacienteId, (input.reuniao_id as string) ?? '')
    default:
      return { erro: `Tool desconhecida: ${name}` }
  }
}
