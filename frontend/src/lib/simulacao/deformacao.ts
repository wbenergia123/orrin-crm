// frontend/src/lib/simulacao/deformacao.ts
// Proportional editing radial sobre Float32Array de posições (x,y,z por vértice).
// Puro — sem three — para ser testável. O Viewer3D faz a ponte com BufferGeometry.

export interface Vec3 { x: number; y: number; z: number }

export interface RegiaoConfig {
  id: string
  label: string
  grupo: 'nariz' | 'labios' | 'queixo' | 'malar'
  ancora: string           // chave no objeto de âncoras
  ancoraEspelho?: string   // par E/D — espelha o deslocamento no eixo x
  eixo: 'x' | 'y' | 'z'
  raio: number             // fração da diagonal do bbox
  intensidadeMax: number   // deslocamento máximo (fração da diagonal) quando slider = ±1
}

const EIXO_OFFSET = { x: 0, y: 1, z: 2 } as const

function smoothstep(t: number): number {
  const tc = Math.max(0, Math.min(1, t))
  return tc * tc * (3 - 2 * tc)
}

export class MotorDeformacao {
  // índice de vértices dentro do raio, calculado uma vez por âncora
  // (malha Meshy tem >100k vértices; o slider itera só os poucos mil indexados)
  private indices = new Map<string, number[]>()
  private original: Float32Array
  private diagonal: number

  constructor(original: Float32Array, diagonal: number) {
    this.original = original
    this.diagonal = diagonal
  }

  private indicesPara(chave: string, pos: Vec3, raio: number): number[] {
    const cached = this.indices.get(chave)
    if (cached) return cached
    const idx: number[] = []
    const r = raio * this.diagonal
    const r2 = r * r
    for (let i = 0; i < this.original.length / 3; i++) {
      const dx = this.original[i * 3] - pos.x
      const dy = this.original[i * 3 + 1] - pos.y
      const dz = this.original[i * 3 + 2] - pos.z
      if (dx * dx + dy * dy + dz * dz <= r2) idx.push(i)
    }
    this.indices.set(chave, idx)
    return idx
  }

  /** Recalcular índices quando as âncoras mudarem de posição. */
  limparIndices(): void {
    this.indices.clear()
  }

  private deslocar(destino: Float32Array, pos: Vec3, chave: string, cfg: RegiaoConfig, delta: number): void {
    const r = cfg.raio * this.diagonal
    const off = EIXO_OFFSET[cfg.eixo]
    for (const i of this.indicesPara(chave, pos, cfg.raio)) {
      const dx = this.original[i * 3] - pos.x
      const dy = this.original[i * 3 + 1] - pos.y
      const dz = this.original[i * 3 + 2] - pos.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const peso = smoothstep(1 - d / r)
      destino[i * 3 + off] += delta * peso
    }
  }

  /**
   * Recalcula `destino` do zero: copia o original e aplica todos os sliders.
   * Não-destrutivo por construção — `original` nunca é modificado.
   */
  aplicar(
    destino: Float32Array,
    ancoras: Record<string, Vec3>,
    valores: Record<string, number>,
    configs: RegiaoConfig[]
  ): void {
    destino.set(this.original)
    for (const cfg of configs) {
      const valor = valores[cfg.id]
      if (!valor) continue
      const pos = ancoras[cfg.ancora]
      if (!pos) continue
      const delta = valor * cfg.intensidadeMax * this.diagonal
      this.deslocar(destino, pos, cfg.ancora, cfg, delta)
      if (cfg.ancoraEspelho && ancoras[cfg.ancoraEspelho]) {
        const deltaEspelho = cfg.eixo === 'x' ? -delta : delta
        this.deslocar(destino, ancoras[cfg.ancoraEspelho], cfg.ancoraEspelho, cfg, deltaEspelho)
      }
    }
  }
}
