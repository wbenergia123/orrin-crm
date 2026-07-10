// frontend/src/lib/simulacao/deformacao.test.ts
import { describe, it, expect } from 'vitest'
import { MotorDeformacao, type RegiaoConfig } from './deformacao'

const configNariz: RegiaoConfig = {
  id: 'nariz_ponta', label: 'Ponta do nariz', grupo: 'nariz',
  ancora: 'nariz_ponta', eixo: 'z', raio: 0.1, intensidadeMax: 0.02,
}

// 2 vértices: um NA âncora (peso 1), outro longe (fora do raio)
const original = new Float32Array([
  0, 0, 0,     // v0 — na âncora
  10, 10, 10,  // v1 — longe
])
const ancoras = { nariz_ponta: { x: 0, y: 0, z: 0 } }
const diagonal = 1 // bbox de referência p/ raio/intensidade

describe('MotorDeformacao', () => {
  it('desloca o vértice na âncora com peso 1 e não toca o vértice fora do raio', () => {
    const motor = new MotorDeformacao(original, diagonal)
    const destino = new Float32Array(original.length)
    motor.aplicar(destino, ancoras, { nariz_ponta: 1 }, [configNariz])
    expect(destino[2]).toBeCloseTo(0.02) // z de v0: +1 * intensidadeMax * diagonal
    expect(destino[3]).toBe(10)          // v1 intacto
    expect(destino[5]).toBe(10)
  })

  it('valor 0 reproduz o original byte a byte', () => {
    const motor = new MotorDeformacao(original, diagonal)
    const destino = new Float32Array(original.length)
    motor.aplicar(destino, ancoras, { nariz_ponta: 0 }, [configNariz])
    expect(Array.from(destino)).toEqual(Array.from(original))
  })

  it('valor negativo desloca no sentido oposto', () => {
    const motor = new MotorDeformacao(original, diagonal)
    const destino = new Float32Array(original.length)
    motor.aplicar(destino, ancoras, { nariz_ponta: -1 }, [configNariz])
    expect(destino[2]).toBeCloseTo(-0.02)
  })

  it('âncora espelhada aplica deslocamento x com sinal invertido', () => {
    const orig = new Float32Array([
      0.05, 0, 0,   // v0 — perto da âncora esquerda
      -0.05, 0, 0,  // v1 — perto da âncora direita (espelho)
    ])
    const motor = new MotorDeformacao(orig, 1)
    const destino = new Float32Array(orig.length)
    const config: RegiaoConfig = {
      id: 'malar', label: 'Malar', grupo: 'malar',
      ancora: 'malar_e', ancoraEspelho: 'malar_d', eixo: 'x', raio: 0.1, intensidadeMax: 0.02,
    }
    motor.aplicar(destino, { malar_e: { x: 0.05, y: 0, z: 0 }, malar_d: { x: -0.05, y: 0, z: 0 } }, { malar: 1 }, [config])
    expect(destino[0]).toBeGreaterThan(0.05)   // esquerdo empurrado pra fora (+x)
    expect(destino[3]).toBeLessThan(-0.05)     // direito empurrado pra fora (−x)
    expect(destino[0] - 0.05).toBeCloseTo(-(destino[3] + 0.05)) // simétrico
  })

  it('mesma âncora com raios diferentes não compartilha índice em cache', () => {
    // v0 na âncora; v1 a 0.075 da âncora — dentro do raio 0.1, fora do raio 0.05
    const orig = new Float32Array([0, 0, 0, 0.075, 0, 0])
    const motor = new MotorDeformacao(orig, 1)
    const destino = new Float32Array(orig.length)
    const raioPequeno: RegiaoConfig = { id: 'a', label: 'A', grupo: 'queixo', ancora: 'queixo', eixo: 'z', raio: 0.05, intensidadeMax: 0.02 }
    const raioGrande: RegiaoConfig = { id: 'b', label: 'B', grupo: 'queixo', ancora: 'queixo', eixo: 'z', raio: 0.1, intensidadeMax: 0.02 }
    const ancoras2 = { queixo: { x: 0, y: 0, z: 0 } }
    motor.aplicar(destino, ancoras2, { a: 1 }, [raioPequeno])   // popula cache com raio pequeno
    motor.aplicar(destino, ancoras2, { b: 1 }, [raioGrande])    // NÃO pode reusar o índice truncado
    expect(destino[5]).not.toBe(0) // v1.z deve se mover no raio grande
  })

  it('com o conjunto completo de âncoras, desloca nos eixos ANATÔMICOS (GLB rotacionado)', () => {
    // Modelo com eixos rotacionados (como o GLB real da Meshy): lateral = +Y do
    // espaço local, vertical (pra cima) = −X. Slider "y" (vertical) deve mover
    // o vértice ao longo de −X, não do Y local.
    const orig = new Float32Array([0, 0, 0.5]) // vértice na ponta do nariz
    const motor = new MotorDeformacao(orig, 10) // diagonal grande de propósito: não pode ser usada
    const destino = new Float32Array(orig.length)
    const ancorasAnat = {
      nariz_ponta: { x: 0, y: 0, z: 0.5 },
      malar_e: { x: 0, y: 0.1, z: 0.4 },   // lateral ao longo de +Y
      malar_d: { x: 0, y: -0.1, z: 0.4 },
      nariz_dorso: { x: -0.05, y: 0, z: 0.45 }, // "cima" = −X
      queixo: { x: 0.05, y: 0, z: 0.45 },
    }
    const elevacao: RegiaoConfig = {
      id: 'elev', label: 'Elevação', grupo: 'nariz', ancora: 'nariz_ponta',
      eixo: 'y', raio: 0.2, intensidadeMax: 0.02,
    }
    motor.aplicar(destino, ancorasAnat, { elev: 1 }, [elevacao])
    // unidade = largura do rosto (0.2); deslocamento = 1 * 0.02 * 0.2 = 0.004 ao longo de "cima" (−X)
    expect(destino[0]).toBeCloseTo(-0.004)
    expect(destino[1]).toBeCloseTo(0)
    expect(destino[2]).toBeCloseTo(0.5)
  })

  it('âncoras degeneradas (lateral ~paralelo à vertical) caem no fallback dos eixos locais', () => {
    const orig = new Float32Array([0, 0, 0])
    const motor = new MotorDeformacao(orig, 1)
    const destino = new Float32Array(orig.length)
    const ancorasRuins = {
      nariz_ponta: { x: 0, y: 0, z: 0 },
      malar_e: { x: 0, y: 0.1, z: 0 },
      malar_d: { x: 0, y: -0.1, z: 0 },
      nariz_dorso: { x: 0, y: 0.05, z: 0 }, // vertical paralela à lateral — inválido
      queixo: { x: 0, y: -0.05, z: 0 },
    }
    const cfg: RegiaoConfig = {
      id: 'p', label: 'P', grupo: 'nariz', ancora: 'nariz_ponta',
      eixo: 'z', raio: 0.2, intensidadeMax: 0.02,
    }
    motor.aplicar(destino, ancorasRuins, { p: 1 }, [cfg])
    // fallback: eixo z local; unidade ainda é a largura do rosto (0.2)
    expect(destino[2]).toBeCloseTo(0.004)
    expect(destino[0]).toBeCloseTo(0)
  })
})
