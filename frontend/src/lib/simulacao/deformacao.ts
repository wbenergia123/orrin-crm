// frontend/src/lib/simulacao/deformacao.ts
// Proportional editing radial sobre Float32Array de posições (x,y,z por vértice).
// Puro — sem three — para ser testável. O Viewer3D faz a ponte com BufferGeometry.
//
// Calibração anatômica (abordagem do 3D-face-morph/Topsakal: raio de influência
// por landmark em unidade anatômica): a unidade de escala é a LARGURA DO ROSTO
// medida pelas âncoras malares (malar_e ↔ malar_d), e os eixos de deslocamento
// são derivados das âncoras (lateral = malar→malar, vertical = queixo→dorso do
// nariz, profundidade = perpendicular). Isso torna a regulagem independente da
// orientação/escala arbitrária do GLB da Meshy. Sem âncoras suficientes (ou com
// âncoras degeneradas), cai no fallback antigo: diagonal do bbox + eixos locais.

export interface Vec3 { x: number; y: number; z: number }

export interface RegiaoConfig {
  id: string
  label: string
  grupo: 'nariz' | 'labios' | 'queixo' | 'malar'
  ancora: string           // chave no objeto de âncoras
  ancoraEspelho?: string   // par E/D — espelha o deslocamento lateral
  eixo: 'x' | 'y' | 'z'    // x=lateral, y=vertical, z=profundidade (anatômicos)
  raio: number             // fração da largura do rosto (fallback: da diagonal do bbox)
  intensidadeMax: number   // deslocamento máximo (mesma unidade) quando slider = ±1
}

function smoothstep(t: number): number {
  const tc = Math.max(0, Math.min(1, t))
  return tc * tc * (3 - 2 * tc)
}

function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
function norm(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) }
function normalize(v: Vec3): Vec3 { const n = norm(v) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n } }
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z }

const EIXOS_IDENTIDADE: Record<'x' | 'y' | 'z', Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
}

export class MotorDeformacao {
  // índice de vértices dentro do raio, calculado uma vez por âncora
  // (malha Meshy tem >100k vértices; o slider itera só os poucos mil indexados)
  private indices = new Map<string, number[]>()
  private original: Float32Array
  private diagonal: number

  // calibração anatômica (recalculada quando o objeto de âncoras muda)
  private ancorasCalibradas: Record<string, Vec3> | null = null
  private unidade: number
  private eixos: Record<'x' | 'y' | 'z', Vec3> = EIXOS_IDENTIDADE

  constructor(original: Float32Array, diagonal: number) {
    this.original = original
    this.diagonal = diagonal
    this.unidade = diagonal
  }

  private calibrar(ancoras: Record<string, Vec3>): void {
    if (this.ancorasCalibradas === ancoras) return
    this.ancorasCalibradas = ancoras
    this.indices.clear() // unidade/raios podem ter mudado

    this.unidade = this.diagonal
    this.eixos = EIXOS_IDENTIDADE

    const { malar_e, malar_d, nariz_dorso, queixo } = ancoras
    if (!malar_e || !malar_d) return

    const lateral = sub(malar_e, malar_d)
    const larguraRosto = norm(lateral)
    if (larguraRosto <= 0) return
    this.unidade = larguraRosto

    if (!nariz_dorso || !queixo) return
    const verticalBruto = sub(nariz_dorso, queixo) // aponta "para cima" no rosto
    const alturaBruta = norm(verticalBruto)
    if (alturaBruta <= 0) return

    // Base só é confiável se lateral e vertical forem ~perpendiculares.
    // Âncoras mal posicionadas (ex.: colocadas numa malha já deformada) produzem
    // vetores quase paralelos — nesse caso, fallback para os eixos locais.
    const cosseno = Math.abs(dot(lateral, verticalBruto)) / (larguraRosto * alturaBruta)
    if (cosseno > 0.7) return

    const x = normalize(lateral)                    // lateral (dir → esq do paciente)
    const z = normalize(cross(lateral, verticalBruto)) // profundidade (para fora do rosto)
    const y = normalize(cross(z, x))                // vertical (para cima), ortogonalizado
    this.eixos = { x, y, z }
  }

  private indicesPara(chave: string, pos: Vec3, raio: number): number[] {
    const chaveCache = `${chave}:${raio}`
    const cached = this.indices.get(chaveCache)
    if (cached) return cached
    const idx: number[] = []
    const r = raio * this.unidade
    const r2 = r * r
    for (let i = 0; i < this.original.length / 3; i++) {
      const dx = this.original[i * 3] - pos.x
      const dy = this.original[i * 3 + 1] - pos.y
      const dz = this.original[i * 3 + 2] - pos.z
      if (dx * dx + dy * dy + dz * dz <= r2) idx.push(i)
    }
    this.indices.set(chaveCache, idx)
    return idx
  }

  /** Recalcular índices quando as âncoras mudarem de posição. */
  limparIndices(): void {
    this.indices.clear()
    this.ancorasCalibradas = null
  }

  private deslocar(destino: Float32Array, pos: Vec3, chave: string, cfg: RegiaoConfig, delta: number): void {
    const r = cfg.raio * this.unidade
    const dir = this.eixos[cfg.eixo]
    for (const i of this.indicesPara(chave, pos, cfg.raio)) {
      const dx = this.original[i * 3] - pos.x
      const dy = this.original[i * 3 + 1] - pos.y
      const dz = this.original[i * 3 + 2] - pos.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const peso = smoothstep(1 - d / r) * delta
      destino[i * 3] += peso * dir.x
      destino[i * 3 + 1] += peso * dir.y
      destino[i * 3 + 2] += peso * dir.z
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
    this.calibrar(ancoras)
    destino.set(this.original)
    for (const cfg of configs) {
      const valor = valores[cfg.id]
      if (!valor) continue
      const pos = ancoras[cfg.ancora]
      if (!pos) continue
      const delta = valor * cfg.intensidadeMax * this.unidade
      this.deslocar(destino, pos, cfg.ancora, cfg, delta)
      if (cfg.ancoraEspelho && ancoras[cfg.ancoraEspelho]) {
        const deltaEspelho = cfg.eixo === 'x' ? -delta : delta
        this.deslocar(destino, ancoras[cfg.ancoraEspelho], cfg.ancoraEspelho, cfg, deltaEspelho)
      }
    }
  }
}
