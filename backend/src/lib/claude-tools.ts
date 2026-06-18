import { supabase } from '../db/supabase'
import type Anthropic from '@anthropic-ai/sdk'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VerificarSlotsInput {
  data_inicio: string
  data_fim: string
  profissional_id?: string
}

export interface CriarAgendamentoInput {
  paciente_id: string
  servico_id: string
  profissional_id: string
  data_hora: string
  notas?: string
}

type DisponibilidadeItem = {
  data: string
  profissional_id: string
  profissional_nome: string
  slots: string[]
}

type ResultadoCriar =
  | { sucesso: true; agendamento_id: string; data_hora_confirmada: string }
  | { sucesso: false; erro: 'slot_ocupado'; mensagem: string }

// ─── Definições das tools para a API da Anthropic ─────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'atualizar_paciente',
    description: 'Salva o nome do paciente no cadastro. Use assim que o paciente informar o nome.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: { type: 'string', description: 'Nome completo do paciente' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'listar_profissionais',
    description: 'Lista os profissionais ativos da clínica disponíveis para agendamento.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'verificar_slots',
    description:
      'Retorna horários disponíveis para agendamento. Use data_inicio e data_fim para buscar em um período. profissional_id é opcional — omita para ver disponibilidade de todos os profissionais.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: {
          type: 'string',
          description: 'Data inicial no formato YYYY-MM-DD',
        },
        data_fim: {
          type: 'string',
          description: 'Data final no formato YYYY-MM-DD',
        },
        profissional_id: {
          type: 'string',
          description: 'UUID do profissional (opcional)',
        },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
  {
    name: 'criar_agendamento',
    description:
      'Cria um agendamento. Chame APENAS após confirmação explícita do paciente (ele disse sim, confirmo, pode marcar, etc.). Retorna erro slot_ocupado se o horário foi tomado — nesse caso chame verificar_slots novamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        paciente_id: { type: 'string', description: 'UUID do paciente' },
        servico_id: { type: 'string', description: 'UUID do serviço' },
        profissional_id: { type: 'string', description: 'UUID do profissional' },
        data_hora: {
          type: 'string',
          description: 'Data e hora no formato ISO 8601 sem timezone, ex: 2026-06-11T11:00:00',
        },
        notas: { type: 'string', description: 'Observações opcionais' },
      },
      required: ['paciente_id', 'servico_id', 'profissional_id', 'data_hora'],
    },
  },
  {
    name: 'confirmar_agendamento',
    description: 'Confirma a presença do paciente em um agendamento. Use quando o paciente confirmar que vai comparecer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'UUID do agendamento a confirmar' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento a pedido do paciente. Use quando o paciente confirmar que não vai comparecer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'UUID do agendamento a cancelar' },
      },
      required: ['agendamento_id'],
    },
  },
]

// ─── Implementações ───────────────────────────────────────────────────────────

export async function executarAtualizarPaciente(
  pacienteId: string,
  nome: string
): Promise<{ sucesso: boolean }> {
  const { error } = await supabase
    .from('pacientes')
    .update({ nome: nome.trim() })
    .eq('id', pacienteId)
  if (error) throw error
  return { sucesso: true }
}

export async function executarListarProfissionais(): Promise<{
  profissionais: { id: string; nome: string }[]
}> {
  const { data, error } = await supabase
    .from('profissionais')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  if (error) throw error
  return { profissionais: data ?? [] }
}

export async function executarVerificarSlots(
  input: VerificarSlotsInput
): Promise<{ disponibilidade: DisponibilidadeItem[] }> {
  // Busca profissionais relevantes
  let query = supabase.from('profissionais').select('id, nome').eq('ativo', true).order('nome')
  if (input.profissional_id) query = query.eq('id', input.profissional_id)
  const { data: profissionais, error: profError } = await query
  if (profError) throw profError
  if (!profissionais?.length) return { disponibilidade: [] }

  const profIds = profissionais.map((p) => p.id)

  // Busca agendamentos ativos no período em uma só query
  const { data: ocupados, error: agError } = await supabase
    .from('agendamentos')
    .select('profissional_id, data_hora')
    .in('profissional_id', profIds)
    .neq('status', 'cancelado')
    .gte('data_hora', `${input.data_inicio}T00:00:00`)
    .lte('data_hora', `${input.data_fim}T23:59:59`)
  if (agError) throw agError

  // Monta set de slots ocupados: "profissional_id|YYYY-MM-DD|HH"
  // data_hora é retornado pelo Supabase em UTC — converte para BRT (UTC-3, sem DST desde 2019)
  const occupiedSet = new Set<string>()
  for (const a of ocupados ?? []) {
    const utcHour = parseInt(a.data_hora.substring(11, 13), 10)
    const brtHour = ((utcHour - 3) + 24) % 24
    // A data pode mudar ao converter UTC→BRT (ex: 01:00 UTC → 22:00 BRT do dia anterior)
    const dt = new Date(a.data_hora)
    const brtDate = new Date(dt.getTime() - 3 * 60 * 60 * 1000)
    const dateStr = brtDate.toISOString().substring(0, 10)
    const hourStr = brtHour.toString().padStart(2, '0')
    occupiedSet.add(`${a.profissional_id}|${dateStr}|${hourStr}`)
  }

  // Gera disponibilidade para cada profissional, cada dia no período
  const disponibilidade: DisponibilidadeItem[] = []
  const inicio = new Date(`${input.data_inicio}T00:00:00`)
  const fim = new Date(`${input.data_fim}T00:00:00`)

  for (const prof of profissionais) {
    const current = new Date(inicio.getTime())
    while (current <= fim) {
      const dateStr = current.toISOString().substring(0, 10)
      const slots: string[] = []

      for (let h = 8; h < 18; h++) {
        const hourStr = h.toString().padStart(2, '0')
        if (!occupiedSet.has(`${prof.id}|${dateStr}|${hourStr}`)) {
          slots.push(`${hourStr}:00`)
        }
      }

      if (slots.length > 0) {
        disponibilidade.push({
          data: dateStr,
          profissional_id: prof.id,
          profissional_nome: prof.nome,
          slots,
        })
      }

      current.setDate(current.getDate() + 1)
    }
  }

  return { disponibilidade }
}

export async function executarCriarAgendamento(
  pacienteId: string,
  input: CriarAgendamentoInput
): Promise<ResultadoCriar> {
  // Normaliza data_hora: se não tem offset de timezone, trata como horário local de Brasília
  const hasOffset = input.data_hora.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(input.data_hora)
  const dataHoraNorm = hasOffset ? input.data_hora : `${input.data_hora}-03:00`

  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      paciente_id: pacienteId, // Sempre usa o ID real do paciente — não confia no input do Claude
      servico_id: input.servico_id,
      profissional_id: input.profissional_id,
      data_hora: dataHoraNorm,
      notas: input.notas ?? null,
      status: 'agendado',
    })
    .select()
    .single()

  if (error) {
    // Postgres unique violation → double-booking
    if (error.code === '23505') {
      return {
        sucesso: false,
        erro: 'slot_ocupado',
        mensagem:
          'Esse horário acabou de ser ocupado por outro paciente. Chame verificar_slots novamente para ver a disponibilidade atual.',
      }
    }
    throw error
  }

  // Atualiza status do paciente (não rebaixa cliente já consolidado)
  const { error: updErr } = await supabase
    .from('pacientes')
    .update({ status: 'consulta_agendada' })
    .eq('id', pacienteId)
    .in('status', ['novo', 'em_conversa'])
  if (updErr) console.error('[claude-tools] falha ao atualizar status do paciente:', updErr)

  // Formata texto legível para a confirmação (usa valor normalizado para hora correta)
  const hora = dataHoraNorm.substring(11, 16)
  const dataFormatada = new Date(
    input.data_hora.substring(0, 10) + 'T12:00:00'
  ).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  })

  return {
    sucesso: true,
    agendamento_id: data.id,
    data_hora_confirmada: `${dataFormatada} às ${hora}`,
  }
}

export async function executarConfirmarAgendamento(
  agendamentoId: string,
  pacienteId: string
): Promise<{ sucesso: boolean }> {
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'confirmado' })
    .eq('id', agendamentoId)
    .eq('paciente_id', pacienteId)
  if (error) throw error
  return { sucesso: true }
}

export async function executarCancelarAgendamento(
  agendamentoId: string,
  pacienteId: string
): Promise<{ sucesso: boolean }> {
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', agendamentoId)
    .eq('paciente_id', pacienteId)
  if (error) throw error
  return { sucesso: true }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executarTool(
  pacienteId: string,
  name: string,
  input: Record<string, unknown>
): Promise<object> {
  switch (name) {
    case 'atualizar_paciente':
      return executarAtualizarPaciente(pacienteId, (input.nome as string) ?? '')
    case 'listar_profissionais':
      return executarListarProfissionais()
    case 'verificar_slots':
      return executarVerificarSlots(input as unknown as VerificarSlotsInput)
    case 'criar_agendamento':
      return executarCriarAgendamento(pacienteId, input as unknown as CriarAgendamentoInput)
    case 'confirmar_agendamento':
      return executarConfirmarAgendamento((input.agendamento_id as string) ?? '', pacienteId)
    case 'cancelar_agendamento':
      return executarCancelarAgendamento((input.agendamento_id as string) ?? '', pacienteId)
    default:
      return { erro: `Tool desconhecida: ${name}` }
  }
}
