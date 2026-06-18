import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../db/supabase'

const router = Router()

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('servicos').select('*').eq('ativo', true).order('nome')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('servicos').select('*').eq('id', req.params.id).single()
  if (error) { res.status(404).json({ error: 'Serviço não encontrado' }); return }
  res.json(data)
})

const servicoSchema = z.object({
  nome: z.string().min(2),
  preco: z.number().positive(),
  duracao_minutos: z.number().int().positive().default(60),
})

router.post('/', async (req, res) => {
  const parsed = servicoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabase.from('servicos').insert(parsed.data).select().single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const schema = z.object({
    nome: z.string().optional(),
    preco: z.number().positive().optional(),
    ativo: z.boolean().optional(),
    duracao_minutos: z.number().int().positive().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabase.from('servicos').update(parsed.data).eq('id', req.params.id).select().single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('servicos').update({ ativo: false }).eq('id', req.params.id)
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(204).send()
})

export default router
