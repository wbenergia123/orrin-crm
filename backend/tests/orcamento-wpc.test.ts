import { describe, it, expect } from 'vitest'
import { calcularOrcamentoWpc, ajustarToolsParaRevest } from '../src/lib/orcamento-wpc'

function ok(r: ReturnType<typeof calcularOrcamentoWpc>) {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`)
  return r
}

describe('calcularOrcamentoWpc', () => {
  it('parede baixa e larga aproveita 2 peças por painel', () => {
    // 2,40 de largura = 15 peças; painel de 2,70 rende 2 peças de 1,10 → 8 painéis
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, cidade: 'São José' }))
    expect(r.pecas).toBe(15)
    expect(r.pecas_por_painel).toBe(2)
    expect(r.paineis).toBe(8)
    expect(r.comprimento_painel_m).toBe(2.7)
    // 8 x 79,90 + 6 tubos x 20,00 + frete 30,00
    expect(r.tubos_pu).toBe(6)
    expect(r.total_centavos).toBe(8 * 7990 + 6 * 2000 + 3000)
  })

  it('parede alta não aproveita: 1 peça por painel', () => {
    // mesma medida invertida — 1,10 de largura, 2,40 de altura
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, cidade: 'São José' }))
    expect(r.pecas).toBe(7)
    expect(r.pecas_por_painel).toBe(1)
    expect(r.paineis).toBe(7)
    expect(r.total_centavos).toBe(7 * 7990 + 5 * 2000 + 3000)
  })

  it('com instalação usa o preço instalado e zera o frete', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, com_instalacao: true }))
    expect(r.frete_centavos).toBe(0)
    expect(r.total_centavos).toBe(7 * 10990 + 5 * 2000)
    expect(r.mensagem).toContain('Frete: grátis')
  })

  it('com instalação não exige cidade', () => {
    expect(calcularOrcamentoWpc({ largura_m: 3, altura_m: 2.5, com_instalacao: true }).ok).toBe(true)
  })

  it('cola PU: 1 tubo a cada 1,5 painel, arredondado pra cima', () => {
    const um = ok(calcularOrcamentoWpc({ largura_m: 0.16, altura_m: 2.5, com_instalacao: true }))
    expect(um.paineis).toBe(1)
    expect(um.tubos_pu).toBe(1)
    const tres = ok(calcularOrcamentoWpc({ largura_m: 0.48, altura_m: 2.5, com_instalacao: true }))
    expect(tres.paineis).toBe(3)
    expect(tres.tubos_pu).toBe(2)
  })

  it('largura que não é múltiplo de 16cm arredonda pra cima', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.0, altura_m: 2.5, com_instalacao: true }))
    expect(r.pecas).toBe(7) // 6,25 → 7
  })

  it('cidade aceita acento, caixa, sufixo do estado e apelido', () => {
    const capital = ['Florianópolis', 'florianopolis', 'FLORIANÓPOLIS - SC', 'Florianópolis/SC',
      'Florianopolis SC', 'Floripa', 'floripa', 'Floripa - SC', 'FPolis']
    for (const cidade of capital) {
      const r = ok(calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, cidade }))
      expect(r.frete_centavos, cidade).toBe(5000)
    }
    for (const cidade of ['São José', 'sao jose sc', 'Biguaçu', 'biguacu/SC', 'Palhoça']) {
      const r = ok(calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, cidade }))
      expect([3000, 4000], cidade).toContain(r.frete_centavos)
    }
  })

  it('ajustarToolsParaRevest tira o trator sem mexer nas outras tools', () => {
    const original = [
      { name: 'atualizar_cliente', description: 'atividade rural, trator/colheitadeira', input_schema: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'listar_produtos', description: 'lista', input_schema: { type: 'object' as const, properties: {}, required: [] } },
    ]
    const ajustado = ajustarToolsParaRevest(original)
    expect(ajustado).toHaveLength(2)
    // O que importa é ela não ter onde GRAVAR trator — a descrição cita o termo
    // de propósito, como proibição explícita ("NUNCA pergunte sobre... trator").
    expect(Object.keys(ajustado[0].input_schema.properties!)).toEqual(['nome', 'cidade'])
    expect(ajustado[0].description).toMatch(/NUNCA pergunte/)
    expect(ajustado[1]).toBe(original[1]) // intocada
    expect(original[0].description).toMatch(/trator/) // não mutou o array da Agrokhan
  })

  it('cidade fora da tabela vira handoff, não orçamento errado', () => {
    const r = calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, cidade: 'Curitiba' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('cidade_sem_frete')
  })

  it('sem instalação e sem cidade não inventa frete', () => {
    const r = calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('cidade_sem_frete')
  })

  it('parede mais alta que 2,90 não é orçada', () => {
    const r = calcularOrcamentoWpc({ largura_m: 2, altura_m: 3.2, com_instalacao: true })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('altura_acima_do_padrao')
  })

  it('medida zerada ou absurda é recusada', () => {
    expect(calcularOrcamentoWpc({ largura_m: 0, altura_m: 2.5, com_instalacao: true }).ok).toBe(false)
    expect(calcularOrcamentoWpc({ largura_m: 2, altura_m: -1, com_instalacao: true }).ok).toBe(false)
    expect(calcularOrcamentoWpc({ largura_m: 999, altura_m: 2.5, com_instalacao: true }).ok).toBe(false)
  })

  it('dinheiro não escorre em float', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, cidade: 'Biguaçu' }))
    expect(r.mensagem).toContain('R$ 799,20')
    expect(Number.isInteger(r.total_centavos)).toBe(true)
  })
})
