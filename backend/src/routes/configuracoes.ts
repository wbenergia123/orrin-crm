import { Router } from 'express'
import { supabase } from '../db/supabase'
import { invalidarCachePrompt } from '../lib/claude-agent'

const router = Router()

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor, updated_at')
    .order('chave')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ configuracoes: data ?? [] })
})

router.patch('/:chave', async (req, res) => {
  const { chave } = req.params
  const { valor } = req.body

  if (typeof valor !== 'string') {
    res.status(400).json({ error: 'Campo valor é obrigatório e deve ser string' })
    return
  }

  if (chave === 'prompt_ana' && valor.trim() === '') {
    res.status(400).json({ error: 'Prompt não pode ser vazio' })
    return
  }

  // Busca valor atual para salvar no histórico
  const { data: atual } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', chave)
    .single()

  if (atual) {
    await supabase.from('configuracoes_historico').insert({
      chave,
      valor_anterior: atual.valor,
    })
  }

  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave, valor, updated_at: new Date().toISOString() })
  if (error) { res.status(500).json({ error: error.message }); return }

  if (chave === 'prompt_ana') invalidarCachePrompt()

  res.json({ sucesso: true })
})

export default router
