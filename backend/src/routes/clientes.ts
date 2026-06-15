// backend/src/routes/clientes.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Cliente não encontrado' })
  res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const { telefone, nome, empresa, email } = req.body
  if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' })

  const { data, error } = await supabaseAdmin
    .from('clientes')
    .insert({ telefone, nome, empresa, email, status: 'novo', tenant_id: req.user!.tenant_id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('clientes')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Cliente deletado' })
})

export default router
