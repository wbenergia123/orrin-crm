import { describe, it, expect } from 'vitest'
import { calcularOrcamentoWpc, calcularOrcamentoAutocolante, ajustarToolsParaRevest, TOOL_ENVIAR_FOTO_PRODUTO, TOOL_ORCAMENTO_WPC } from '../src/lib/orcamento-wpc'

function ok(r: ReturnType<typeof calcularOrcamentoWpc>) {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`)
  return r
}

describe('calcularOrcamentoWpc', () => {
  it('parede baixa e larga aproveita 2 peças por painel', () => {
    // 2,40 de largura = 15 peças; painel de 2,70 rende 2 peças de 1,10 → 8 painéis
    const r = ok(calcularOrcamentoWpc({ largura_m: 2.4, altura_m: 1.1, fixacao: 'cola', cidade: 'São José' }))
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
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', cidade: 'São José' }))
    expect(r.pecas).toBe(7)
    expect(r.pecas_por_painel).toBe(1)
    expect(r.paineis).toBe(7)
    expect(r.total_centavos).toBe(7 * 7990 + 5 * 2000 + 3000)
  })

  it('com instalação usa o preço instalado e zera o frete', () => {
    const r = ok(calcularOrcamentoWpc({ largura_m: 1.1, altura_m: 2.4, fixacao: 'cola', com_instalacao: true }))
    expect(r.frete_centavos).toBe(0)
    expect(r.total_centavos).toBe(7 * 10990 + 5 * 2000)
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
    // 8 x 79,90 + 6 tubos x 20,00 + frete 50,00 = 809,20
    expect(r.total_centavos).toBe(80920)
    expect(r.total_a_vista_centavos).toBe(76874)      // 809,20 - 5%
    expect(r.parcela_centavos).toBe(Math.ceil(80920 / 6))
    expect(r.mensagem).toContain('Total: R$ 809,20')
    expect(r.mensagem).toContain('À vista com 5% de desconto: R$ 768,74')
    expect(r.mensagem).toContain('6x de R$ 134,87 sem juros')
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
    expect(r.mensagem).toContain('6 tubos de cola PU: R$ 120,00')
    expect(r.mensagem).not.toContain('x R$ 79,90')
    expect(r.mensagem).not.toContain('x R$ 20,00')
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
    expect(r.mensagem).toContain('R$ 799,20')
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
  function okA(r: ReturnType<typeof calcularOrcamentoAutocolante>) {
    if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}`)
    return r
  }

  it('mistura rolo de 10m com de 2,50m quando sai mais barato', () => {
    // 10 faixas de 2,40: rolo de 10m rende 4, de 2,50m rende 1.
    // 2 longos + 2 curtos = 779,60 — mais barato que 3 longos (899,70) ou 10 curtos (899,00)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 1, altura_m: 2.4, cidade: 'São José' }))
    expect(r.faixas).toBe(10)
    expect(r.rolos_10m).toBe(2)
    expect(r.rolos_2_5m).toBe(2)
    expect(r.total_centavos).toBe(2 * 29990 + 2 * 8990 + 3000)
    expect(r.mensagem).toContain('R$ 599,80') // 2 rolos de 10m
  })

  it('parede baixa usa só rolo curto quando basta', () => {
    // 3 faixas de 1,20: rolo de 2,50m rende 2 → 2 curtos (179,80) < 1 longo (299,90)
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 0.3, altura_m: 1.2, cidade: 'São José' }))
    expect(r.rolos_10m).toBe(0)
    expect(r.rolos_2_5m).toBe(2)
    expect(r.mensagem).not.toContain('10m:')
  })

  it('parede acima de 2,50m só cabe no rolo de 10m', () => {
    const r = okA(calcularOrcamentoAutocolante({ largura_m: 2, altura_m: 2.6, cidade: 'São José' }))
    expect(r.faixas).toBe(20)
    expect(r.rolos_2_5m).toBe(0)
    expect(r.rolos_10m).toBe(7) // 3 faixas por rolo
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
