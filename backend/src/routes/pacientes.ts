import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'
import { StatusPaciente } from '../types'

const router = Router()

const statusValidos: StatusPaciente[] = ['novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio']

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('pacientes')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })

  if (req.query.status && statusValidos.includes(req.query.status as StatusPaciente)) {
    query = query.eq('status', req.query.status)
  }

  if (req.query.busca) {
    const b = req.query.busca as string
    query = query.or(`nome.ilike.%${b}%,telefone.ilike.%${b}%,cpf.ilike.%${b}%`)
  }

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('pacientes')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (error) { res.status(404).json({ error: 'Paciente não encontrado' }); return }
  res.json(data)
})

const createSchema = z.object({
  telefone: z.string().min(10),
  nome: z.string().optional(),
  email: z.string().email().optional(),
  cpf: z.string().optional(),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio']).default('novo'),
})

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabaseAdmin
    .from('pacientes')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const updateSchema = z.object({
    nome: z.string().optional(),
    email: z.string().email().optional(),
    cpf: z.string().optional(),
    data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabaseAdmin
    .from('pacientes')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.patch('/:id/status', async (req, res) => {
  const schema = z.object({
    status: z.enum(['novo', 'em_conversa', 'consulta_agendada', 'cliente', 'frio']),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabaseAdmin
    .from('pacientes')
    .update({ status: parsed.data.status })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

export default router
