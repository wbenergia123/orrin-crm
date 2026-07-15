export type ProfissionalBasico = { id: string; nome: string }
export type Ocupacao = { profissional_id: string; data_hora: string }
export type Bloqueio = { profissional_id: string; data_hora_inicio: string; data_hora_fim: string }
export type DisponibilidadeItem = {
  data: string
  profissional_id: string
  profissional_nome: string
  slots: string[]
}

export function calcularDisponibilidade(
  profissionais: ProfissionalBasico[],
  ocupados: Ocupacao[],
  bloqueios: Bloqueio[],
  dataInicio: string,
  dataFim: string
): DisponibilidadeItem[] {
  // Monta set de slots ocupados: "profissional_id|YYYY-MM-DD|HH"
  // data_hora é TIMESTAMP local (Brasília) — sem conversão de timezone.
  const occupiedSet = new Set<string>()
  for (const a of ocupados ?? []) {
    const dateStr = a.data_hora.substring(0, 10)
    const hourStr = a.data_hora.substring(11, 13)
    occupiedSet.add(`${a.profissional_id}|${dateStr}|${hourStr}`)
  }

  // Bloqueios: itera hora a hora usando as strings locais diretamente (sem toISOString).
  const blockedSet = new Set<string>()
  for (const b of bloqueios ?? []) {
    let dateStr = b.data_hora_inicio.substring(0, 10)
    let h = parseInt(b.data_hora_inicio.substring(11, 13), 10)
    const endDateStr = b.data_hora_fim.substring(0, 10)
    const endH = parseInt(b.data_hora_fim.substring(11, 13), 10)

    while (dateStr < endDateStr || (dateStr === endDateStr && h < endH)) {
      blockedSet.add(`${b.profissional_id}|${dateStr}|${String(h).padStart(2, '0')}`)
      h++
      if (h >= 24) {
        h = 0
        const next = new Date(dateStr + 'T12:00:00Z')
        next.setUTCDate(next.getUTCDate() + 1)
        dateStr = next.toISOString().substring(0, 10)
      }
    }
  }

  const disponibilidade: DisponibilidadeItem[] = []
  const inicio = new Date(`${dataInicio}T00:00:00`)
  const fim = new Date(`${dataFim}T00:00:00`)

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

  return disponibilidade
}
