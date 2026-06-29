// backend/src/routes/injetaveis.ts
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// Listar injetáveis do tenant
router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('injetaveis')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('nome', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Criar injetável
router.post('/', async (req: Request, res: Response) => {
  const { nome, categoria, cor_hex, unidade, custo } = req.body
  if (!nome || !categoria) {
    return res.status(400).json({ error: 'nome e categoria são obrigatórios' })
  }

  const { data, error } = await supabaseAdmin
    .from('injetaveis')
    .insert({ nome, categoria, cor_hex, unidade, custo, tenant_id: req.user!.tenant_id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Atualizar injetável
router.patch('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('injetaveis')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Desativar injetável (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('injetaveis')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Injetável desativado' })
})

export default router
