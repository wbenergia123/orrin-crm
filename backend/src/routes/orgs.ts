// backend/src/routes/orgs.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// Rota pública — chamada antes do login para validar se a org existe
// Usa supabaseAdmin (service role) para bypassar RLS
// Retorna apenas campos públicos
router.get('/by-slug/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params

  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, nome, ativo, slug')
    .eq('slug', slug.toLowerCase())
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Organização não encontrada' })
  }

  if (!data.ativo) {
    return res.status(404).json({ error: 'Organização não disponível' })
  }

  res.json(data)
})

export default router
