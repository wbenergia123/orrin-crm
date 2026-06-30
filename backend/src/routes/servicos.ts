import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('servicos')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('nome')
  if (req.query.ativo === 'true') query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('servicos')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (error) { res.status(404).json({ error: 'Serviço não encontrado' }); return }
  res.json(data)
})

const servicoSchema = z.object({
  nome: z.string().min(2),
  preco: z.number().positive(),
  duracao_minutos: z.number().int().positive().default(60),
  requer_avaliacao: z.boolean().default(false),
  ocultar_preco: z.boolean().default(false),
})

router.post('/', async (req, res) => {
  const parsed = servicoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('servicos')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const schema = z.object({
    nome: z.string().optional(),
    preco: z.number().positive().optional(),
    ativo: z.boolean().optional(),
    duracao_minutos: z.number().int().positive().optional(),
    requer_avaliacao: z.boolean().optional(),
    ocultar_preco: z.boolean().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('servicos')
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
    .from('servicos')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(204).send()
})

export default router
