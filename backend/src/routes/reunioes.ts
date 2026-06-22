// backend/src/routes/reunioes.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('reunioes')
    .select('*, clientes(*)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data_hora', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req: Request, res: Response) => {
  const { cliente_id, data_hora } = req.body
  if (!cliente_id || !data_hora) {
    return res.status(400).json({ error: 'cliente_id e data_hora são obrigatórios' })
  }

  const { data, error } = await supabaseAdmin
    .from('reunioes')
    .insert({ cliente_id, data_hora, status: 'agendada', tenant_id: req.user!.tenant_id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await supabaseAdmin
    .from('clientes')
    .update({ status: 'reuniao_agendada' })
    .eq('id', cliente_id)
    .eq('tenant_id', req.user!.tenant_id)

  res.status(201).json(data)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('reunioes')
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
    .from('reunioes')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Reunião deletada' })
})

export default router
