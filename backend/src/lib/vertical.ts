import { supabaseAdmin } from '../services/supabase'

export type Vertical = 'clinica' | 'agro'

const cache = new Map<string, { vertical: Vertical; expires: number }>()

export function invalidarCacheVertical(tenantId: string): void {
  cache.delete(tenantId)
}

export async function getVerticalDoTenant(tenantId: string): Promise<Vertical> {
  const hit = cache.get(tenantId)
  if (hit && hit.expires > Date.now()) return hit.vertical

  const { data } = await supabaseAdmin
    .from('organizacoes')
    .select('vertical')
    .eq('id', tenantId)
    .single()

  const vertical: Vertical = data?.vertical === 'agro' ? 'agro' : 'clinica'
  cache.set(tenantId, { vertical, expires: Date.now() + 60_000 })
  return vertical
}
