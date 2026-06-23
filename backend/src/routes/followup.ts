import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/regras', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('followup_regras')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('ordem_prioridade', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data ?? [])
})

router.patch('/regras/:id', async (req, res) => {
  const schema = z.object({
    template: z.string().min(1).optional(),
    ativo: z.boolean().optional(),
    delay_minutos: z.number().int().min(1).optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('followup_regras')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.json(data)
})

export default router
