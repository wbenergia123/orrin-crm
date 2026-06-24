import { Router } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { invalidarCachePrompt } from '../lib/claude-agent'

const router = Router()

router.get('/', async (req, res) => {
  if (!req.user!.tenant_id) { res.json({ configuracoes: [] }); return }

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor, updated_at')
    .eq('tenant_id', req.user!.tenant_id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ configuracoes: data ?? [] })
})

router.patch('/:chave', async (req, res) => {
  const { chave } = req.params
  const { valor } = req.body
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

  if (chave === 'prompt_ana' && req.user!.tenant_id) {
    invalidarCachePrompt(req.user!.tenant_id)
  }

  res.json(data)
})

export default router
