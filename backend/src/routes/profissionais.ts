import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('profissionais')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('nome')
  if (req.query.ativo === 'true') query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

const profissionalSchema = z.object({ nome: z.string().min(2) })

router.post('/', async (req, res) => {
  const parsed = profissionalSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const schema = z.object({
    nome: z.string().min(2).optional(),
    ativo: z.boolean().optional(),
  }).refine((v) => v.nome !== undefined || v.ativo !== undefined, {
    message: 'At least one field is required',
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('profissionais')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(204).send()
})

export default router
