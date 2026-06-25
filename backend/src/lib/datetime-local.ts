// agendamentos.data_hora é uma coluna TIMESTAMP (sem timezone) — o texto salvo já é
// o horário local da clínica (ex: "2026-06-25T14:00:00" = 14h no fuso da clínica),
// não um instante UTC. Por isso nunca deve passar por `new Date(texto)` seguido de
// conversão de fuso — isso desloca o horário por engano. As funções aqui tratam esse
// texto como o que ele é: wall-clock local, não um instante real.

const FUSO_PADRAO = 'America/Sao_Paulo'

// Converte um instante real (Date) pro texto local (sem timezone) usado em data_hora.
export function comoTextoLocal(instante: Date, timezone: string = FUSO_PADRAO): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instante)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

// "Agora", formatado como o mesmo texto local (sem timezone) usado em data_hora.
export function agoraComoTextoLocal(timezone: string = FUSO_PADRAO): string {
  return comoTextoLocal(new Date(), timezone)
}

// Soma minutos a um texto local — aritmética de calendário pura, sem envolver fuso
// (trata o texto como UTC só internamente, pra reaproveitar a aritmética do Date).
export function somarMinutosTextoLocal(textoLocal: string, minutos: number): string {
  const fake = new Date(`${textoLocal}Z`)
  fake.setUTCMinutes(fake.getUTCMinutes() + minutos)
  return fake.toISOString().substring(0, 19)
}

// Extrai data (YYYY-MM-DD) e hora (HH:MM) direto do texto local — sem conversão.
export function formatarTextoLocal(textoLocal: string): { data: string; hora: string } {
  return {
    data: textoLocal.substring(0, 10),
    hora: textoLocal.substring(11, 16),
  }
}
