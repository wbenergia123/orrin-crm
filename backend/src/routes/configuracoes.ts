import { Router } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req, res) => {
  if (!req.user!.tenant_id) { res.json({ configuracoes: [] }); return }

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor, updated_at')
    .eq('tenant_id', req.user!.tenant_id)
    .neq('chave', 'prompt_ana')

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ configuracoes: data ?? [] })
})

router.patch('/:chave', async (req, res) => {
  const { chave } = req.params
  const { valor } = req.body

  // prompt_ana só pode ser editado pelo painel Admin (super_admin) — controla o
  // comportamento inteiro da Ana, risco alto demais pra edição direta pela clínica.
  if (chave === 'prompt_ana') {
    res.status(403).json({ error: 'Esse campo só pode ser editado pelo painel Admin.' })
    return
  }

  if (typeof valor !== 'string') {
    res.status(400).json({ error: 'valor deve ser uma string' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .upsert({
      tenant_id: req.user!.tenant_id,
      chave,
      valor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,chave' })
    .select('chave, valor, updated_at')
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  res.json(data)
})

export default router
