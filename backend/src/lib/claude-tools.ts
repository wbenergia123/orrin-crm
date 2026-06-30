import { supabase } from '../db/supabase'
import type Anthropic from '@anthropic-ai/sdk'
import { formatarTextoLocal } from './datetime-local'

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

export interface RemarcarAgendamentoInput {
  agendamento_id: string
  data_hora: string
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

type ResultadoRemarcar =
  | { sucesso: true; data_hora_confirmada: string }
  | { sucesso: false; erro: 'slot_ocupado' | 'nao_encontrado'; mensagem: string }

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
    name: 'remarcar_agendamento',
    description:
      'Muda a data/hora de um agendamento existente para um novo horário. Chame APENAS após confirmação explícita do paciente sobre o novo horário. Retorna erro slot_ocupado se o novo horário foi tomado — nesse caso chame verificar_slots novamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'UUID do agendamento a remarcar' },
        data_hora: {
          type: 'string',
          description: 'Nova data e hora no formato ISO 8601 sem timezone, ex: 2026-06-11T11:00:00',
        },
      },
      required: ['agendamento_id', 'data_hora'],
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

export async function executarListarProfissionais(tenantId: string): Promise<{
  profissionais: { id: string; nome: string }[]
}> {
  const { data, error } = await supabase
    .from('profissionais')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('nome')
  if (error) throw error
  return { profissionais: data ?? [] }
}

export async function executarVerificarSlots(
  input: VerificarSlotsInput,
  tenantId: string
): Promise<{ disponibilidade: DisponibilidadeItem[] }> {
  let query = supabase
    .from('profissionais')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('nome')
  if (input.profissional_id) query = query.eq('id', input.profissional_id)
  const { data: profissionais, error: profError } = await query
  if (profError) throw profError
  if (!profissionais?.length) return { disponibilidade: [] }

  const profIds = profissionais.map((p) => p.id)

  const { data: ocupados, error: agError } = await supabase
    .from('agendamentos')
    .select('profissional_id, data_hora')
    .eq('tenant_id', tenantId)
    .in('profissional_id', profIds)
    .neq('status', 'cancelado')
    .gte('data_hora', `${input.data_inicio}T00:00:00`)
    .lte('data_hora', `${input.data_fim}T23:59:59`)
  if (agError) throw agError

  // Tolerância à migration 022 ainda não aplicada: só busca bloqueios se a tabela existir.
  const { data: tabelaExiste } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'bloqueios_agenda')
    .maybeSingle()

  let bloqueios: { profissional_id: string; data_hora_inicio: string; data_hora_fim: string }[] | null = null
  if (tabelaExiste) {
    const { data, error: blError } = await supabase
      .from('bloqueios_agenda')
      .select('profissional_id, data_hora_inicio, data_hora_fim')
      .eq('tenant_id', tenantId)
      .in('profissional_id', profIds)
      .lte('data_hora_inicio', `${input.data_fim}T23:59:59`)
      .gte('data_hora_fim', `${input.data_inicio}T00:00:00`)
    if (blError) throw blError
    bloqueios = data
  }

  // Monta set de slots ocupados: "profissional_id|YYYY-MM-DD|HH"
  // data_hora é uma coluna TIMESTAMP (sem timezone) — o texto salvo já é o horário
  // de Brasília literal, sem precisar de nenhuma conversão.
  const occupiedSet = new Set<string>()
  for (const a of ocupados ?? []) {
    const dateStr = a.data_hora.substring(0, 10)
    const hourStr = a.data_hora.substring(11, 13)
    occupiedSet.add(`${a.profissional_id}|${dateStr}|${hourStr}`)
  }

  // Bloqueios podem cobrir vários slots — marca cada slot cujo início cai no intervalo.
  const blockedSet = new Set<string>()
  for (const b of bloqueios ?? []) {
    let current = new Date(`${b.data_hora_inicio.substring(0, 10)}T${b.data_hora_inicio.substring(11, 13)}:00:00`)
    const end = new Date(`${b.data_hora_fim.substring(0, 10)}T${b.data_hora_fim.substring(11, 13)}:00:00`)
    while (current < end) {
      const dateStr = current.toISOString().substring(0, 10)
      const hourStr = current.toISOString().substring(11, 13)
      blockedSet.add(`${b.profissional_id}|${dateStr}|${hourStr}`)
      current.setHours(current.getHours() + 1)
    }
  }

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
        const key = `${prof.id}|${dateStr}|${hourStr}`
        if (!occupiedSet.has(key) && !blockedSet.has(key)) {
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
  input: CriarAgendamentoInput,
  tenantId: string
): Promise<ResultadoCriar> {
  // data_hora é uma coluna TIMESTAMP (sem timezone) — qualquer indicador de fuso no
  // texto (Z, +03:00 etc.) é ignorado pelo Postgres ao salvar, então normaliza
  // removendo aqui pra refletir exatamente o que vai ficar salvo.
  const dataHoraNorm = input.data_hora.replace(/(Z|[+-]\d{2}:\d{2})$/, '')

  // Verifica double-booking manualmente (a tabela pode não ter unique constraint)
  const { data: existente } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('profissional_id', input.profissional_id)
    .eq('data_hora', dataHoraNorm)
    .neq('status', 'cancelado')
    .limit(1)
    .single()

  if (existente) {
    return {
      sucesso: false,
      erro: 'slot_ocupado',
      mensagem:
        'Esse horário acabou de ser ocupado por outro paciente. Chame verificar_slots novamente para ver a disponibilidade atual.',
    }
  }

  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      servico_id: input.servico_id,
      profissional_id: input.profissional_id,
      data_hora: dataHoraNorm,
      notas: input.notas ?? null,
      status: 'agendado',
    })
    .select()
    .single()

  if (error) {
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
    .eq('tenant_id', tenantId)
    .in('status', ['novo', 'em_conversa'])
  if (updErr) console.error('[claude-tools] falha ao atualizar status do paciente:', updErr)

  const { data: dataConfirmada, hora } = formatarTextoLocal(dataHoraNorm)
  const [ano, mes, dia] = dataConfirmada.split('-').map(Number)
  const dataFormatada = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return {
    sucesso: true,
    agendamento_id: data.id,
    data_hora_confirmada: `${dataFormatada} às ${hora}`,
  }
}

export async function executarRemarcarAgendamento(
  input: RemarcarAgendamentoInput,
  pacienteId: string,
  tenantId: string
): Promise<ResultadoRemarcar> {
  const { data: original, error: fetchError } = await supabase
    .from('agendamentos')
    .select('profissional_id, status')
    .eq('id', input.agendamento_id)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchError || !original) {
    return {
      sucesso: false,
      erro: 'nao_encontrado',
      mensagem: 'Agendamento não encontrado.',
    }
  }

  if (original.status === 'cancelado') {
    return {
      sucesso: false,
      erro: 'nao_encontrado',
      mensagem: 'Esse agendamento já está cancelado. Use criar_agendamento para marcar um novo.',
    }
  }

  const dataHoraNorm = input.data_hora.replace(/(Z|[+-]\d{2}:\d{2})$/, '')

  // Verifica double-booking manualmente (a tabela pode não ter unique constraint)
  const { data: existente } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('profissional_id', original.profissional_id)
    .eq('data_hora', dataHoraNorm)
    .neq('status', 'cancelado')
    .neq('id', input.agendamento_id)
    .limit(1)
    .single()

  if (existente) {
    return {
      sucesso: false,
      erro: 'slot_ocupado',
      mensagem:
        'Esse horário acabou de ser ocupado por outro paciente. Chame verificar_slots novamente para ver a disponibilidade atual.',
    }
  }

  // Remarcar reabre o ciclo de confirmação — mesmo padrão de criar_agendamento
  const { error } = await supabase
    .from('agendamentos')
    .update({ data_hora: dataHoraNorm, status: 'agendado' })
    .eq('id', input.agendamento_id)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)

  if (error) {
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

  const { data: dataConfirmada, hora } = formatarTextoLocal(dataHoraNorm)
  const [ano, mes, dia] = dataConfirmada.split('-').map(Number)
  const dataFormatada = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return {
    sucesso: true,
    data_hora_confirmada: `${dataFormatada} às ${hora}`,
  }
}

export async function executarConfirmarAgendamento(
  agendamentoId: string,
  pacienteId: string,
  tenantId: string
): Promise<{ sucesso: boolean }> {
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'confirmado' })
    .eq('id', agendamentoId)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)
  if (error) throw error
  return { sucesso: true }
}

export async function executarCancelarAgendamento(
  agendamentoId: string,
  pacienteId: string,
  tenantId: string
): Promise<{ sucesso: boolean }> {
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', agendamentoId)
    .eq('paciente_id', pacienteId)
    .eq('tenant_id', tenantId)
  if (error) throw error
  return { sucesso: true }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executarTool(
  tenantId: string,
  pacienteId: string,
  name: string,
  input: Record<string, unknown>
): Promise<object> {
  switch (name) {
    case 'atualizar_paciente':
      return executarAtualizarPaciente(pacienteId, (input.nome as string) ?? '')
    case 'listar_profissionais':
      return executarListarProfissionais(tenantId)
    case 'verificar_slots':
      return executarVerificarSlots(input as unknown as VerificarSlotsInput, tenantId)
    case 'criar_agendamento':
      return executarCriarAgendamento(pacienteId, input as unknown as CriarAgendamentoInput, tenantId)
    case 'remarcar_agendamento':
      return executarRemarcarAgendamento(input as unknown as RemarcarAgendamentoInput, pacienteId, tenantId)
    case 'confirmar_agendamento':
      return executarConfirmarAgendamento((input.agendamento_id as string) ?? '', pacienteId, tenantId)
    case 'cancelar_agendamento':
      return executarCancelarAgendamento((input.agendamento_id as string) ?? '', pacienteId, tenantId)
    default:
      return { erro: `Tool desconhecida: ${name}` }
  }
}
