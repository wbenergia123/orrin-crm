import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Colunas tipo created_at/enviado_em são TIMESTAMP (sem timezone) no banco, mas
// o valor guardado é sempre UTC de verdade (vem de NOW() ou .toISOString()) —
// só falta o "Z" no texto. Sem isso, new Date(texto) é interpretado como
// horário local do navegador, mostrando a hora 3h adiantada no Brasil.
export function parseUtcTimestamp(value: string): Date {
  return new Date(value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)
}
