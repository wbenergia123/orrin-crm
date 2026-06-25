import { describe, it, expect } from 'vitest'
import { agoraComoTextoLocal, comoTextoLocal, somarMinutosTextoLocal, formatarTextoLocal } from '../src/lib/datetime-local'

describe('comoTextoLocal', () => {
  it('converte um instante real pro texto local de Brasília, sem timezone', () => {
    // 2026-06-25T17:30:00Z = 14:30 em Brasília (UTC-3)
    const instante = new Date('2026-06-25T17:30:00Z')
    expect(comoTextoLocal(instante)).toBe('2026-06-25T14:30:00')
  })
})

describe('agoraComoTextoLocal', () => {
  it('retorna o horário atual de Brasília, não o do processo (UTC nos testes)', () => {
    const texto = agoraComoTextoLocal()
    const brasilia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    // formato en-CA: "2026-06-25, 14:30" — compara só os primeiros 16 caracteres relevantes
    expect(texto.substring(0, 10)).toBe(brasilia.substring(0, 10))
    expect(texto.substring(11, 16)).toBe(brasilia.substring(12, 17))
  })
})

describe('somarMinutosTextoLocal', () => {
  it('soma minutos sem deslocar fuso', () => {
    expect(somarMinutosTextoLocal('2026-06-25T14:00:00', 30)).toBe('2026-06-25T14:30:00')
  })

  it('atravessa virada de dia corretamente', () => {
    expect(somarMinutosTextoLocal('2026-06-25T23:50:00', 20)).toBe('2026-06-26T00:10:00')
  })
})

describe('formatarTextoLocal', () => {
  it('extrai data e hora direto do texto, sem conversão', () => {
    expect(formatarTextoLocal('2026-06-25T14:00:00')).toEqual({ data: '2026-06-25', hora: '14:00' })
  })
})
