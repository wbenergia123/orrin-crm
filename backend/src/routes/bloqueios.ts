import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

const bloqueioSchema = z.object({
  profissional_id: z.string().uuid(),
  data_hora_inicio: z.string().datetime({ offset: true }),
  data_hora_fim: z.string().datetime({ offset: true }),
  motivo: z.string().max(255).optional(),
})

function normalizarTextoLocal(dataHora: string): string {
  return dataHora.replace(/(Z|[+-]\d{2}:\d{2})$/, '')
}

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('bloqueios_agenda')
    .select('*, profissional:profissionais(id, nome)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data_hora_inicio', { ascending: true })

  if (req.query.profissional_id) query = query.eq('profissional_id', req.query.profissional_id as string)
  if (req.query.data_inicio) query = query.gte('data_hora_inicio', req.query.data_inicio as string)
  if (req.query.data_fim) query = query.lte('data_hora_fim', req.query.data_fim as string)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.post('/', async (req, res) => {
  const parsed = bloqueioSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const inicio = normalizarTextoLocal(parsed.data.data_hora_inicio)
  const fim = normalizarTextoLocal(parsed.data.data_hora_fim)

  if (inicio >= fim) {
    res.status(400).json({ error: 'O fim do bloqueio deve ser após o início' })
    return
  }

  const { data: conflito } = await supabaseAdmin
    .from('agendamentos')
    .select('id')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', parsed.data.profissional_id)
    .neq('status', 'cancelado')
    .lt('data_hora', fim)
    .gte('data_hora', inicio)
    .limit(1)

  if (conflito && conflito.length > 0) {
    res.status(409).json({ error: 'Já existe um agendamento neste horário' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('bloqueios_agenda')
    .insert({
      tenant_id: req.user!.tenant_id,
      profissional_id: parsed.data.profissional_id,
      data_hora_inicio: inicio,
      data_hora_fim: fim,
      motivo: parsed.data.motivo ?? null,
      created_by: req.user!.id,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('bloqueios_agenda')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})

export default router
