// backend/tests/claude-tools-agro.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabase } from '../src/db/supabase'
import { executarToolAgro, TOOLS_AGRO } from '../src/lib/claude-tools-agro'

let tenantId: string
let pacienteId: string
let vendedorId: string
let produtoId: string

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'tools-agro-test', nome: 'Tools Agro Test', vertical: 'agro' })
    .select('id')
    .single()
  tenantId = org!.id
  const { data: p } = await supabase
    .from('pacientes')
    .insert({ tenant_id: tenantId, telefone: '5545999990003', status: 'em_conversa' })
    .select('id')
    .single()
  pacienteId = p!.id
  const { data: v } = await supabase
    .from('profissionais')
    .insert({ tenant_id: tenantId, nome: 'Vendedora Maria', ativo: true })
    .select('id')
    .single()
  vendedorId = v!.id
  const { data: prod } = await supabase
    .from('produtos')
    .insert({ tenant_id: tenantId, nome: 'Concha Frontal CF-800', categoria: 'Conchas' })
    .select('id')
    .single()
  produtoId = prod!.id
})

afterAll(async () => {
  await supabase.from('reunioes_agro').delete().eq('tenant_id', tenantId)
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('produtos').delete().eq('tenant_id', tenantId)
  await supabase.from('profissionais').delete().eq('tenant_id', tenantId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('TOOLS_AGRO', () => {
  it('não contém tools de clínica', () => {
    const nomes = TOOLS_AGRO.map((t) => t.name)
    expect(nomes).toContain('criar_reuniao')
    expect(nomes).toContain('listar_produtos')
    expect(nomes).not.toContain('criar_agendamento')
    expect(nomes).not.toContain('listar_profissionais')
  })
})

describe('atualizar_cliente', () => {
  it('salva campos agro', async () => {
    const r = await executarToolAgro(tenantId, pacienteId, 'atualizar_cliente', {
      nome: 'Carlos Produtor', cidade: 'Cascavel', atividade: 'soja', maquinas: 'John Deere 6110J',
    })
    expect(r).toEqual({ sucesso: true })
    const { data } = await supabase.from('pacientes').select('nome, cidade, atividade, maquinas').eq('id', pacienteId).single()
    expect(data!.cidade).toBe('Cascavel')
  })
})

describe('listar_produtos e registrar_interesse', () => {
  it('lista catálogo e registra interesse', async () => {
    const lista = (await executarToolAgro(tenantId, pacienteId, 'listar_produtos', {})) as { produtos: { id: string; nome: string }[] }
    expect(lista.produtos.length).toBe(1)

    const r = await executarToolAgro(tenantId, pacienteId, 'registrar_interesse', { produto_id: produtoId })
    expect(r).toEqual({ sucesso: true, produto: 'Concha Frontal CF-800' })
    const { data } = await supabase.from('pacientes').select('produto_interesse_id').eq('id', pacienteId).single()
    expect(data!.produto_interesse_id).toBe(produtoId)
  })
})

describe('verificar_slots_vendedores e criar_reuniao', () => {
  it('mostra slots, cria reunião virtual e move o funil', async () => {
    const slots = (await executarToolAgro(tenantId, pacienteId, 'verificar_slots_vendedores', {
      data_inicio: '2026-07-21', data_fim: '2026-07-21',
    })) as { disponibilidade: { profissional_id: string; slots: string[] }[] }
    expect(slots.disponibilidade[0].slots).toContain('09:00')

    const r = (await executarToolAgro(tenantId, pacienteId, 'criar_reuniao', {
      profissional_id: vendedorId, data_hora: '2026-07-21T09:00:00', tipo: 'virtual', link_reuniao: 'https://meet.google.com/xyz',
    })) as { sucesso: boolean }
    expect(r.sucesso).toBe(true)

    const { data: p } = await supabase.from('pacientes').select('status').eq('id', pacienteId).single()
    expect(p!.status).toBe('reuniao_agendada')

    // slot agora ocupado
    const slots2 = (await executarToolAgro(tenantId, pacienteId, 'verificar_slots_vendedores', {
      data_inicio: '2026-07-21', data_fim: '2026-07-21',
    })) as { disponibilidade: { slots: string[] }[] }
    expect(slots2.disponibilidade[0].slots).not.toContain('09:00')
  })

  it('criar_reuniao virtual sem link retorna erro amigável (não exception)', async () => {
    const r = (await executarToolAgro(tenantId, pacienteId, 'criar_reuniao', {
      profissional_id: vendedorId, data_hora: '2026-07-22T10:00:00', tipo: 'virtual',
    })) as { sucesso: boolean; erro?: string }
    expect(r.sucesso).toBe(false)
  })
})
