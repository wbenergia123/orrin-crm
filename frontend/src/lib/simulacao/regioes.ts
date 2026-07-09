// frontend/src/lib/simulacao/regioes.ts
import type { RegiaoConfig } from './deformacao'

// Âncoras que o profissional posiciona no wizard (ordem = ordem do wizard)
export const ANCORAS_WIZARD: { chave: string; instrucao: string }[] = [
  { chave: 'nariz_ponta', instrucao: 'Clique na ponta do nariz' },
  { chave: 'nariz_dorso', instrucao: 'Clique no meio do dorso do nariz' },
  { chave: 'labio_sup', instrucao: 'Clique no centro do lábio superior' },
  { chave: 'labio_inf', instrucao: 'Clique no centro do lábio inferior' },
  { chave: 'queixo', instrucao: 'Clique na ponta do queixo' },
  { chave: 'malar_e', instrucao: 'Clique na maçã do rosto ESQUERDA (do paciente)' },
  { chave: 'malar_d', instrucao: 'Clique na maçã do rosto DIREITA (do paciente)' },
]

export const REGIOES: RegiaoConfig[] = [
  // ── Nariz ──────────────────────────────────────────────
  { id: 'nariz_projecao', label: 'Projeção da ponta', grupo: 'nariz', ancora: 'nariz_ponta', eixo: 'z', raio: 0.06, intensidadeMax: 0.02 },
  { id: 'nariz_elevacao', label: 'Elevação da ponta', grupo: 'nariz', ancora: 'nariz_ponta', eixo: 'y', raio: 0.06, intensidadeMax: 0.015 },
  { id: 'nariz_dorso', label: 'Dorso nasal', grupo: 'nariz', ancora: 'nariz_dorso', eixo: 'z', raio: 0.07, intensidadeMax: 0.015 },
  // ── Lábios ─────────────────────────────────────────────
  { id: 'labio_sup_volume', label: 'Volume lábio superior', grupo: 'labios', ancora: 'labio_sup', eixo: 'z', raio: 0.045, intensidadeMax: 0.012 },
  { id: 'labio_inf_volume', label: 'Volume lábio inferior', grupo: 'labios', ancora: 'labio_inf', eixo: 'z', raio: 0.045, intensidadeMax: 0.012 },
  // ── Queixo ─────────────────────────────────────────────
  { id: 'queixo_projecao', label: 'Projeção do queixo', grupo: 'queixo', ancora: 'queixo', eixo: 'z', raio: 0.08, intensidadeMax: 0.02 },
  { id: 'queixo_comprimento', label: 'Comprimento vertical', grupo: 'queixo', ancora: 'queixo', eixo: 'y', raio: 0.07, intensidadeMax: 0.015 },
  // ── Malar ──────────────────────────────────────────────
  { id: 'malar_volume', label: 'Volume malar', grupo: 'malar', ancora: 'malar_e', ancoraEspelho: 'malar_d', eixo: 'z', raio: 0.07, intensidadeMax: 0.015 },
]

export const GRUPOS: { id: RegiaoConfig['grupo']; label: string }[] = [
  { id: 'nariz', label: 'Nariz' },
  { id: 'labios', label: 'Lábios' },
  { id: 'queixo', label: 'Queixo' },
  { id: 'malar', label: 'Malar' },
]
