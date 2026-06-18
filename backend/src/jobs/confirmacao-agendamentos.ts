import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { addDays, startOfDay, endOfDay, format } from 'date-fns'
import { supabase } from '../db/supabase'
import { enviarMensagemViaUAZAPI } from '../lib/uazapi-client'

const TZ = 'America/Sao_Paulo'

interface AgendamentoLembrete {
  id: string
  data_hora: string
  telefone: string
  paciente_nome: string | null
  servico_nome: string
  profissional_nome: string
}

export async function buscarAgendamentosParaLembrete(): Promise<AgendamentoLembrete[]> {
  const agoraSP = toZonedTime(new Date(), TZ)
  const amanhaSP = addDays(agoraSP, 1)
  const inicio = fromZonedTime(startOfDay(amanhaSP), TZ)
  const fim = fromZonedTime(endOfDay(amanhaSP), TZ)

  const { data, error } = await supabase
    .from('agendamentos')
    .select(`
      id, data_hora,
      pacientes ( nome, telefone ),
      servicos ( nome ),
      profissionais ( nome )
    `)
    .gte('data_hora', inicio.toISOString())
    .lte('data_hora', fim.toISOString())
    .eq('status', 'agendado')
    .is('lembrete_enviado_em', null)

  if (error) {
    console.error('[LEMBRETE] Erro ao buscar agendamentos:', error)
    return []
  }

  return (data ?? []).map((ag) => ({
    id: ag.id,
    data_hora: ag.data_hora,
    telefone: (ag.pacientes as unknown as { telefone: string }).telefone,
    paciente_nome: (ag.pacientes as unknown as { nome: string | null }).nome,
    servico_nome: (ag.servicos as unknown as { nome: string }).nome,
    profissional_nome: (ag.profissionais as unknown as { nome: string }).nome,
  }))
}

async function enviarLembrete(ag: AgendamentoLembrete): Promise<boolean> {
  const horaSP = toZonedTime(new Date(ag.data_hora), TZ)
  const hora = format(horaSP, 'HH:mm')
  const nome = ag.paciente_nome ?? 'você'
  const texto = `Olá ${nome}! Lembrete da sua ${ag.servico_nome} amanhã às ${hora} com ${ag.profissional_nome}. Confirma presença? Responda sim ou não.`

  return enviarMensagemViaUAZAPI({ phone: ag.telefone, text: texto })
}

async function marcarLembreteEnviado(agendamentoId: string): Promise<void> {
  await supabase
    .from('agendamentos')
    .update({ lembrete_enviado_em: new Date().toISOString() } as any)
    .eq('id', agendamentoId)
}

export async function executarLembretes(): Promise<void> {
  console.log('[LEMBRETE] Iniciando envio de lembretes...')

  const agendamentos = await buscarAgendamentosParaLembrete()
  console.log(`[LEMBRETE] ${agendamentos.length} agendamento(s) para lembrar`)

  for (const ag of agendamentos) {
    const enviado = await enviarLembrete(ag)

    if (enviado) {
      await marcarLembreteEnviado(ag.id)
      console.log(`[LEMBRETE] Enviado para ${ag.telefone}`)
    } else {
      console.error(`[LEMBRETE] Falha ao enviar para ${ag.telefone} — retry em 15min`)
      setTimeout(async () => {
        const retry = await enviarLembrete(ag)
        if (retry) {
          await marcarLembreteEnviado(ag.id)
          console.log(`[LEMBRETE] Retry OK para ${ag.telefone}`)
        } else {
          console.error(`[LEMBRETE] Retry falhou para ${ag.telefone}`)
        }
      }, 15 * 60 * 1000)
    }
  }

  console.log('[LEMBRETE] Concluído')
}
