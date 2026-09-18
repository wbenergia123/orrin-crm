import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { calcularOrcamentoWpc, calcularOrcamentoAutocolante, precoPainelMaterial, ajustarToolsParaRevest, TOOL_ENVIAR_FOTO_PRODUTO, TOOL_ORCAMENTO_WPC } from '../src/lib/orcamento-wpc'

function ok(r: ReturnType<typeof calcularOrcamentoWpc>) {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`)
  return r
}

describe('calcularOrcamentoWpc', () => {
  // Preço cheio: os valores abaixo são do painel a R$ 79,90, fora da promoção.
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T12:00:00-03:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('parede baixa e larga aproveita 2 peças por painel', () => {
    // 2,40 de largura = 15 peças; painel de 2,70 rende 2 peças de 1,10 → 8 painéis
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'São José' }))
    expect(r.pecas).toBe(15)
    expect(r.pecas_por_painel).toBe(2)
    expect(r.paineis).toBe(8)
    expect(r.comprimento_painel_m).toBe(2.7)
    // 8 x 79,90 + 6 tubos x 25,00 + frete 30,00
    expect(r.tubos_pu).toBe(6)
    expect(r.total_centavos).toBe(8 * 7990 + 6 * 2500 + 3000)
  })

  it('parede alta não aproveita: 1 peça por painel', () => {
    // mesma medida invertida — 1,10 de largura, 2,40 de altura
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', cidade: 'São José' }))
    expect(r.pecas).toBe(7)
    expect(r.pecas_por_painel).toBe(1)
    expect(r.paineis).toBe(7)
    expect(r.total_centavos).toBe(7 * 7990 + 5 * 2500 + 3000)
  })

  it('com instalação usa o preço instalado e zera o frete', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', com_instalacao: true }))
    expect(r.frete_centavos).toBe(0)
    expect(r.total_centavos).toBe(7 * 10990 + 5 * 2500)
    expect(r.mensagem).toContain('Frete: grátis')
  })

  it('com instalação não exige cidade', () => {
    expect(calcularOrcamentoWpc({ largura_m: 3, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }).ok).toBe(true)
  })

  it('cola PU: 1 tubo a cada 1,5 painel, arredondado pra cima', () => {
    const um = ok(calcularOrcamentoWpc({ largura_m: 0.16, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }))
    expect(um.paineis).toBe(1)
    expect(um.tubos_pu).toBe(1)
    const tres = ok(calcularOrcamentoWpc({ largura_m: 0.48, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }))
    expect(tres.paineis).toBe(3)
    expect(tres.tubos_pu).toBe(2)
  })

  it('largura que não é múltiplo de 16cm arredonda pra cima', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.0, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }))
    expect(r.pecas).toBe(7) // 6,25 → 7
  })

  it('cidade aceita acento, caixa, sufixo do estado e apelido', () => {
    const capital = ['Florianópolis', 'florianopolis', 'FLORIANÓPOLIS - SC', 'Florianópolis/SC',
      'Florianopolis SC', 'Floripa', 'floripa', 'Floripa - SC', 'FPolis']
    for (const cidade of capital) {
      const r = ok(calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, fixacao: 'cola', cidade }))
      expect(r.frete_centavos, cidade).toBe(5000)
    }
    for (const cidade of ['São José', 'sao jose sc', 'Biguaçu', 'biguacu/SC', 'Palhoça']) {
      const r = ok(calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, fixacao: 'cola', cidade }))
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
    const r = calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, fixacao: 'cola', cidade: 'Curitiba' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('cidade_sem_frete')
  })

  it('sem instalação e sem cidade não inventa frete', () => {
    const r = calcularOrcamentoWpc({ largura_m: 1, altura_m: 2.5, fixacao: 'cola' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('cidade_sem_frete')
  })

  it('parede mais alta que 2,90 não é orçada', () => {
    const r = calcularOrcamentoWpc({ largura_m: 2, altura_m: 3.2, fixacao: 'cola', com_instalacao: true })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('altura_acima_do_padrao')
  })

  it('medida zerada ou absurda é recusada', () => {
    expect(calcularOrcamentoWpc({ largura_m: 0, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }).ok).toBe(false)
    expect(calcularOrcamentoWpc({ largura_m: 2, altura_m: -1, com_instalacao: true }).ok).toBe(false)
    expect(calcularOrcamentoWpc({ largura_m: 999, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }).ok).toBe(false)
  })

  it('desconto de 5% à vista e 6x sem juros sobre o valor cheio', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'Floripa' }))
    // 8 x 79,90 + 6 tubos x 25,00 + frete 50,00 = 839,20
    expect(r.total_centavos).toBe(83920)
    expect(r.total_a_vista_centavos).toBe(79724)      // 839,20 - 5%
    expect(r.parcela_centavos).toBe(Math.ceil(83920 / 6))
    expect(r.mensagem).toContain('Total: R$ 839,20')
    expect(r.mensagem).toContain('À vista com 5% de desconto: R$ 797,24')
    expect(r.mensagem).toContain('6x de R$ 139,87 sem juros')
  })

  it('6 parcelas nunca somam menos que o total', () => {
    for (const largura of [0.16, 1, 2.4, 3.7, 5.5, 9.3]) {
      const r = ok(calcularOrcamentoWpc({ largura_m: largura, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }))
      expect(r.parcela_centavos * 6, `largura ${largura}`).toBeGreaterThanOrEqual(r.total_centavos)
    }
  })

  it('não mostra preço unitário, só quantidade e total da linha', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'Floripa' }))
    expect(r.mensagem).toContain('8 painéis: R$ 639,20')
    expect(r.mensagem).toContain('6 tubos de cola PU: R$ 150,00')
    expect(r.mensagem).not.toContain('x R$ 79,90')
    expect(r.mensagem).not.toContain('x R$ 25,00')
  })

  it('presilha: 4 por painel a R$ 1,00, no lugar da cola', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'presilha', cidade: 'Floripa' }))
    expect(r.paineis).toBe(8)
    expect(r.presilhas).toBe(32)
    expect(r.tubos_pu).toBe(0)
    expect(r.fixacao_centavos).toBe(3200)
    // 8 x 79,90 + 32 x 1,00 + frete 50,00
    expect(r.total_centavos).toBe(8 * 7990 + 3200 + 5000)
    expect(r.mensagem).toContain('32 presilhas de fixação: R$ 32,00')
    expect(r.mensagem).not.toContain('cola PU')
  })

  it('cola não cobra presilha e presilha não cobra cola', () => {
    const cola = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'Floripa' }))
    expect(cola.presilhas).toBe(0)
    expect(cola.tubos_pu).toBe(6)
    expect(cola.mensagem).not.toContain('presilha')
  })

  it('sem informar a fixação, manda perguntar em vez de escolher sozinho', () => {
    const r = calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, cidade: 'Floripa' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('fixacao_nao_informada')
    expect(r.mensagem).toMatch(/cola PU ou presilha/)
  })

  it('a tool exige a fixação no schema', () => {
    expect(TOOL_ORCAMENTO_WPC.input_schema.required).toContain('fixacao')
  })

  it('largura que é múltiplo exato de 16cm não cobra painel a mais por float', () => {
    // 1,12 / 0,16 = 7.000000000000001 em float
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.12, altura_m: 2.5, fixacao: 'cola', com_instalacao: true }))
    expect(r.pecas).toBe(7)
    expect(r.paineis).toBe(7)
  })

  it('dinheiro não escorre em float', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'Biguaçu' }))
    expect(r.mensagem).toContain('R$ 829,20')
    expect(Number.isInteger(r.total_centavos)).toBe(true)
  })
})

describe('TOOL_ENVIAR_FOTO_PRODUTO', () => {
  it('pede produto_id e legenda opcional, e avisa que a foto vai separada', () => {
    const props = TOOL_ENVIAR_FOTO_PRODUTO.input_schema.properties!
    expect(Object.keys(props).sort()).toEqual(['legenda', 'produto_id'])
    expect(TOOL_ENVIAR_FOTO_PRODUTO.input_schema.required).toEqual(['produto_id'])
    // A foto sai por fora da resposta do agente; se ele não souber disso,
    // termina o turno sem texto nenhum pro cliente.
    expect(TOOL_ENVIAR_FOTO_PRODUTO.description).toMatch(/mensagem separada/i)
  })

  it('tira as tools de agenda: loja de balcão não marca horário', () => {
    const agro = ['atualizar_cliente', 'listar_produtos', 'verificar_slots_vendedores',
                  'criar_reuniao', 'remarcar_reuniao', 'cancelar_reuniao'].map((name) => ({
      name, description: 'x', input_schema: { type: 'object' as const, properties: {}, required: [] },
    }))
    const nomes = ajustarToolsParaRevest(agro).map((t) => t.name)
    expect(nomes).toEqual(['atualizar_cliente', 'listar_produtos'])
    expect(agro).toHaveLength(6) // array da Agrokhan intacto
  })

  it('entra no tool set só com a flag ligada', () => {
    const nomes = [...ajustarToolsParaRevest([]), TOOL_ENVIAR_FOTO_PRODUTO].map((t) => t.name)
    expect(nomes).toContain('enviar_foto_produto')
  })
})

describe('calcularOrcamentoAutocolante', () => {
  // Fora da promoção: os valores abaixo contam com os 5% à vista.
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T12:00:00-03:00')) })
  afterAll(() => { vi.useRealTimers() })

  function okA(r: ReturnType<typeof calcularOrcamentoAutocolante>) {
    if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`)
    return r
  }

  it('conta por metro linear, porque a fita pode ser cortada e emendada', () => {
    // 5,00 de largura = 50 faixas de 2,80 = 140m exatos = 14 rolos de 10m
    // (pela regra de peça inteira do WPC daria 17 — cada rolo só renderia 3 faixas)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 5, altura_m: 2.8, cidade: 'Palhoça' }))
    expect(r.faixas).toBe(50)
    expect(r.metros_lineares).toBe(140)
    expect(r.rolos_10m).toBe(14)
    expect(r.rolos_2_5m).toBe(0)
    expect(r.total_centavos).toBe(14 * 29990 + 4000)
  })

  it('mistura rolo curto quando sobra pouca fita e a faixa cabe nele', () => {
    // 1,00 de largura = 10 faixas de 2,40 = 24m → 2 rolos de 10m + 2 de 2,50m
    // (25m por 779,60) sai mais barato que 3 rolos de 10m (899,70)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'São José' }))
    expect(r.metros_lineares).toBe(24)
    expect(r.rolos_10m).toBe(2)
    expect(r.rolos_2_5m).toBe(2)
    expect(r.total_centavos).toBe(2 * 29990 + 2 * 8990 + 3000)
  })

  it('parede acima de 2,50m não usa rolo curto: a faixa não caberia nele', () => {
    // 2,00 de largura = 20 faixas de 2,60 = 52m → 6 rolos de 10m (60m)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 2, altura_m: 2.6, cidade: 'São José' }))
    expect(r.metros_lineares).toBe(52)
    expect(r.rolos_10m).toBe(6)
    expect(r.rolos_2_5m).toBe(0)
  })

  it('parede baixa usa só rolo curto quando basta', () => {
    // 3 faixas de 1,20 = 3,60m → 2 rolos de 2,50m (179,80) < 1 de 10m (299,90)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 0.3, altura_m: 1.2, cidade: 'São José' }))
    expect(r.rolos_10m).toBe(0)
    expect(r.rolos_2_5m).toBe(2)
  })

  it('é só material: cobra frete da tabela e não fala de instalação', () => {
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'Floripa' }))
    expect(r.frete_centavos).toBe(5000)
    expect(r.total_centavos).toBe(2 * 29990 + 2 * 8990 + 5000)
    expect(r.mensagem).toContain('Frete: R$ 50,00')
    expect(r.mensagem).not.toMatch(/instala/i)
  })

  it('sem cidade ou cidade fora da tabela não fecha orçamento', () => {
    const sem = calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4 })
    expect(sem.ok === false && sem.motivo).toBe('cidade_sem_frete')
    const fora = calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'Blumenau' })
    expect(fora.ok === false && fora.motivo).toBe('cidade_sem_frete')
  })

  it('à vista 5% e 6x arredondado pra cima', () => {
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'São José' }))
    // 779,60 de rolos + 30,00 de frete de São José
    expect(r.total_a_vista_centavos).toBe(Math.round(80960 * 0.95))
    expect(r.parcela_centavos * 6).toBeGreaterThanOrEqual(80960)
  })

  it('largura em múltiplo de 10cm não ganha faixa a mais por float', () => {
    expect(okA(calcularOrcamentoAutocolante({ largura_m: 1.1, altura_m: 2, cidade: 'São José' })).faixas).toBe(11)
  })

  it('altura acima de 10m e medida inválida mandam pra consultora / perguntar', () => {
    const alta = calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 10.5, cidade: 'São José' })
    expect(alta.ok === false && alta.motivo).toBe('altura_acima_do_rolo')
    const zero = calcularOrcamentoAutocolante({ largura_m: 0, altura_m: 2, cidade: 'São José' })
    expect(zero.ok === false && zero.motivo).toBe('medida_invalida')
  })
})

describe('promoção do painel WPC (R$ 59,00 até 26/09/2026)', () => {
  const noDia = (iso: string) => new Date(iso)

  it('vale no último dia até 23h59 de Brasília', () => {
    expect(precoPainelMaterial(noDia('2026-09-18T10:00:00-03:00'))).toBe(5900)
    expect(precoPainelMaterial(noDia('2026-09-26T23:59:00-03:00'))).toBe(5900)
  })

  it('volta sozinha pro preço cheio no dia 27 — mesmo que já seja dia 27 em UTC antes', () => {
    // 26/09 22h em Brasília = 27/09 01h UTC: ainda é promoção
    expect(precoPainelMaterial(noDia('2026-09-27T01:00:00Z'))).toBe(5900)
    expect(precoPainelMaterial(noDia('2026-09-27T00:00:00-03:00'))).toBe(7990)
  })

  it('entra no orçamento só de material; o instalado não muda', () => {
    const agora = noDia('2026-09-20T12:00:00-03:00')
    const material = calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', cidade: 'São José', agora })
    if (!material.ok) throw new Error('esperava ok')
    expect(material.total_centavos).toBe(7 * 5900 + 5 * 2500 + 3000)
    expect(material.mensagem).toContain('7 painéis: R$ 413,00')

    const instalado = calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', com_instalacao: true, agora })
    if (!instalado.ok) throw new Error('esperava ok')
    expect(instalado.total_centavos).toBe(7 * 10990 + 5 * 2500)
  })

  it('durante a promoção o painel sem instalação não tem desconto à vista', () => {
    const r = calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', cidade: 'São José', agora: noDia('2026-09-20T12:00:00-03:00') })
    if (!r.ok) throw new Error('esperava ok')
    expect(r.total_a_vista_centavos).toBe(r.total_centavos)
    expect(r.mensagem).not.toMatch(/desconto/i)
    expect(r.mensagem).toContain('6x de')
  })

  it('durante a promoção nem o instalado nem o autocolante têm desconto à vista', () => {
    const agora = noDia('2026-09-20T12:00:00-03:00')
    const inst = calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', com_instalacao: true, agora })
    if (!inst.ok) throw new Error('esperava ok')
    expect(inst.total_a_vista_centavos).toBe(inst.total_centavos)
    expect(inst.mensagem).not.toMatch(/desconto/i)

    const auto = calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'São José', agora })
    if (!auto.ok) throw new Error('esperava ok')
    expect(auto.total_a_vista_centavos).toBe(auto.total_centavos)
    expect(auto.mensagem).not.toMatch(/desconto/i)
  })

  it('no dia 27 o desconto à vista volta junto com o preço cheio', () => {
    const r = calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', cidade: 'São José', agora: noDia('2026-09-27T09:00:00-03:00') })
    if (!r.ok) throw new Error('esperava ok')
    expect(r.mensagem).toContain('À vista com 5% de desconto')
  })
})
