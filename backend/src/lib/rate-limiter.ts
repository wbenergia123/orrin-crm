// Rate limiting de login por email — in-memory (suficiente para instância única no Render)

const MAX_TENTATIVAS = 5
const BLOQUEIO_MS = 15 * 60 * 1000 // 15 minutos

interface Registro {
  tentativas: number
  bloqueadoAte: number | null
}

const registros = new Map<string, Registro>()

export function verificarBloqueio(email: string): { bloqueado: boolean; segundosRestantes?: number } {
  const reg = registros.get(email)
  if (!reg || reg.bloqueadoAte === null) return { bloqueado: false }

  if (Date.now() < reg.bloqueadoAte) {
    const segundosRestantes = Math.ceil((reg.bloqueadoAte - Date.now()) / 1000)
    return { bloqueado: true, segundosRestantes }
  }

  // Bloqueio expirou — limpa
  registros.delete(email)
  return { bloqueado: false }
}

export function registrarFalha(email: string): void {
  const reg = registros.get(email) ?? { tentativas: 0, bloqueadoAte: null }
  reg.tentativas += 1

  if (reg.tentativas >= MAX_TENTATIVAS) {
    reg.bloqueadoAte = Date.now() + BLOQUEIO_MS
  }

  registros.set(email, reg)
}

export function registrarSucesso(email: string): void {
  registros.delete(email)
}

export function desbloquearEmail(email: string): boolean {
  if (!registros.has(email)) return false
  registros.delete(email)
  return true
}

export function statusEmail(email: string): { tentativas: number; bloqueadoAte: string | null } {
  const reg = registros.get(email)
  if (!reg) return { tentativas: 0, bloqueadoAte: null }
  return {
    tentativas: reg.tentativas,
    bloqueadoAte: reg.bloqueadoAte ? new Date(reg.bloqueadoAte).toISOString() : null,
  }
}
