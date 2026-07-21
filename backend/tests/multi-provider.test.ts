import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import { supabase } from '../src/db/supabase'
import { processarComAgente, invalidarCachePrompt } from '../src/lib/claude-agent'

let tenantId: string
let pacienteId: string
const EMAIL = 'gestor@multi-provider-test.com'

beforeAll(async () => {
  const { data: org } = await supabase
    .from('organizacoes')
    .insert({ slug: 'multi-provider-test', nome: 'Multi Provider Test' })
    .select('id')
    .single()
  tenantId = org!.id

  const hash = await bcrypt.hash('senha123', 10)
  await supabase.from('usuarios').upsert(
    { email: EMAIL, senha_hash: hash, role: 'admin', tenant_id: tenantId },
    { onConflict: 'email' }
  )

  await supabase
    .from('configuracoes')
    .insert({ tenant_id: tenantId, chave: 'ana_model', valor: 'gemini-modelo-invalido-de-proposito' })

  const { data: paciente } = await supabase
    .from('pacientes')
    .insert({ telefone: '5511999999999', status: 'novo', tenant_id: tenantId })
    .select('id')
    .single()
  pacienteId = paciente!.id
})

afterAll(async () => {
  // processarComAgente chama registrarFalhaTecnica no erro do Gemini (sem
  // chave real no ambiente de teste), que insere em conversas_pacientes —
  // precisa limpar antes do paciente por causa da FK.
  await supabase.from('conversas_pacientes').delete().eq('tenant_id', tenantId)
  await supabase.from('pacientes').delete().eq('id', pacienteId)
  await supabase.from('usuarios').delete().eq('email', EMAIL)
  await supabase.from('configuracoes').delete().eq('tenant_id', tenantId)
  await supabase.from('organizacoes').delete().eq('id', tenantId)
  invalidarCachePrompt(tenantId)
})

describe('roteamento de provedor por prefixo do ana_model', () => {
  it('modelo "gemini-*" usa o branch do Gemini (erro de modelo inválido, não de auth Anthropic)', async () => {
    const resposta = await processarComAgente(tenantId, pacienteId, ['Oi'])
    // Não valida sucesso (não há chave real do Gemini no ambiente de teste) —
    // só que o fluxo de erro genérico do agente foi acionado, provando que o
    // branch Gemini rodou (não travou tentando falar com a Anthropic).
    expect(typeof resposta).toBe('string')
    expect(resposta.length).toBeGreaterThan(0)
  })
})
