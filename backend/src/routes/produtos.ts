import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('produtos')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('ativo', true)
    .order('nome')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const produtoSchema = z.object({
  nome: z.string().min(1),
  categoria: z.string().optional(),
  descricao: z.string().optional(),
  foto_url: z.string().optional(),
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = produtoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { data, error } = await supabaseAdmin
    .from('produtos')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = produtoSchema.partial().extend({ ativo: z.boolean().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { data, error } = await supabaseAdmin
    .from('produtos')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Soft delete — produto pode estar referenciado por pacientes.produto_interesse_id
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('produtos')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Produto desativado' })
})

export default router
