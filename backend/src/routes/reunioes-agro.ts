import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  let query = supabaseAdmin
    .from('reunioes_agro')
    .select('*, pacientes(id, nome, telefone), profissionais(id, nome)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data_hora', { ascending: true })
  if (req.query.de) query = query.gte('data_hora', `${req.query.de}T00:00:00`)
  if (req.query.ate) query = query.lte('data_hora', `${req.query.ate}T23:59:59`)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const reuniaoSchema = z.object({
  paciente_id: z.string().uuid(),
  profissional_id: z.string().uuid().nullable().optional(),
  data_hora: z.string().min(16),
  tipo: z.enum(['presencial', 'virtual']).default('presencial'),
  link_reuniao: z.string().nullable().optional(),
  local: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
}).refine((r) => r.tipo !== 'virtual' || !!r.link_reuniao?.trim(), {
  message: 'Reunião virtual exige link_reuniao',
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = reuniaoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const tenant = req.user!.tenant_id
  const dataHoraNorm = parsed.data.data_hora.replace(/(Z|[+-]\d{2}:\d{2})$/, '')
  const { data, error } = await supabaseAdmin
    .from('reunioes_agro')
    .insert({ ...parsed.data, data_hora: dataHoraNorm, tenant_id: tenant, status: 'agendada' })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  await supabaseAdmin
    .from('pacientes')
    .update({ status: 'reuniao_agendada' })
    .eq('id', parsed.data.paciente_id)
    .eq('tenant_id', tenant)
    .in('status', ['novo', 'em_conversa'])
  res.status(201).json(data)
})

const reuniaoUpdateSchema = z.object({
  profissional_id: z.string().uuid().optional(),
  data_hora: z.string().min(16).optional(),
  tipo: z.enum(['presencial', 'virtual']).optional(),
  link_reuniao: z.string().nullable().optional(),
  local: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  status: z.enum(['agendada', 'confirmada', 'cancelada', 'realizada']).optional(),
})

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = reuniaoUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const updates = parsed.data.data_hora
    ? { ...parsed.data, data_hora: parsed.data.data_hora.replace(/(Z|[+-]\d{2}:\d{2})$/, '') }
    : parsed.data
  const { data, error } = await supabaseAdmin
    .from('reunioes_agro')
    .update(updates)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('reunioes_agro')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Reunião removida' })
})

export default router
