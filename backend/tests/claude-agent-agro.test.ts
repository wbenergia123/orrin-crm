import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabase } from '../src/db/supabase'
import { montarContextoAgro } from '../src/lib/claude-agent'

let tenantId: string
let pacienteId: string

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'agent-agro-test', nome: 'Agent Agro Test', vertical: 'agro' })
    .select('id')
    .single()
  tenantId = org!.id
  await supabase.from('produtos').insert({ tenant_id: tenantId, nome: 'Garfo Traseiro GT-600', categoria: 'Garfos' })
  await supabase.from('profissionais').insert({ tenant_id: tenantId, nome: 'Vendedor Pedro', ativo: true })
  const { data: p } = await supabase
    .from('pacientes')
    .insert({ tenant_id: tenantId, telefone: '5545999990004', nome: 'Produtor Ctx', cidade: 'Toledo', atividade: 'milho' })
    .select('id')
    .single()
  pacienteId = p!.id
})

afterAll(async () => {
  await supabase.from('pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('produtos').delete().eq('tenant_id', tenantId)
  await supabase.from('profissionais').delete().eq('tenant_id', tenantId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
})

describe('montarContextoAgro', () => {
  it('inclui produtos, vendedores e dados do cliente — e nada de clínica', async () => {
    const ctx = await montarContextoAgro(tenantId, pacienteId)
    expect(ctx).toContain('Garfo Traseiro GT-600')
    expect(ctx).toContain('Vendedor Pedro')
    expect(ctx).toContain('Toledo')
    expect(ctx).not.toContain('Serviços disponíveis')
    expect(ctx).not.toContain('agendamento')
  })
})
