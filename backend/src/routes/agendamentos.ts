import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

const HORA_INICIO = 8   // 08:00
const HORA_FIM = 18     // 18:00
const DURACAO_MIN = 60

function gerarSlots(dataStr: string): Date[] {
  const slots: Date[] = []
  for (let h = HORA_INICIO; h < HORA_FIM; h++) {
    const slot = new Date(`${dataStr}T00:00:00`)
    slot.setHours(h, 0, 0, 0)
    slots.push(slot)
  }
  return slots
}

function dentroDoExpediente(dataHora: Date): boolean {
  const hora = dataHora.getHours()
  const minuto = dataHora.getMinutes()
  const totalMin = hora * 60 + minuto
  return totalMin >= HORA_INICIO * 60 && totalMin + DURACAO_MIN <= HORA_FIM * 60
}

// IMPORTANT: /slots-disponiveis must be defined BEFORE /:id so Express doesn't treat "slots-disponiveis" as an id
router.get('/slots-disponiveis', async (req, res) => {
  const { data: dataParam, profissional_id } = req.query
  if (!dataParam || !profissional_id) {
    res.status(400).json({ error: 'data e profissional_id são obrigatórios' })
    return
  }

  const dataStr = dataParam as string
  const inicioDia = new Date(`${dataStr}T00:00:00`).toISOString()
  const fimDia = new Date(`${dataStr}T23:59:59`).toISOString()

  const { data: ocupados } = await supabaseAdmin
    .from('agendamentos')
    .select('data_hora')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', profissional_id)
    .neq('status', 'cancelado')
    .gte('data_hora', inicioDia)
    .lte('data_hora', fimDia)

  const horariosOcupados = new Set(
    (ocupados ?? []).map((a) => new Date(a.data_hora).getHours())
  )

  const todos = gerarSlots(dataStr)

  res.json(todos.map((s) => ({
    iso: s.toISOString(),
    hora: `${String(s.getHours()).padStart(2, '0')}:00`,
    disponivel: !horariosOcupados.has(s.getHours()),
  })))
})

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('agendamentos')
    .select('*, paciente:pacientes(id, nome, telefone), servico:servicos(id, nome, preco), profissional:profissionais(id, nome)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data_hora', { ascending: true })

  if (req.query.data_inicio) query = query.gte('data_hora', req.query.data_inicio as string)
  if (req.query.data_fim) query = query.lte('data_hora', req.query.data_fim as string)
  if (req.query.profissional_id) query = query.eq('profissional_id', req.query.profissional_id)
  if (req.query.paciente_id) query = query.eq('paciente_id', req.query.paciente_id)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

const agendamentoSchema = z.object({
  paciente_id: z.string().uuid(),
  servico_id: z.string().uuid(),
  profissional_id: z.string().uuid(),
  data_hora: z.string().datetime(),
  notas: z.string().optional(),
})

router.post('/', async (req, res) => {
  const parsed = agendamentoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const dataHora = new Date(parsed.data.data_hora)
  if (!dentroDoExpediente(dataHora)) {
    res.status(400).json({ error: 'Horário fora do expediente (08:00–18:00)' })
    return
  }

  const fim = new Date(dataHora.getTime() + DURACAO_MIN * 60 * 1000)
  const { data: conflito } = await supabaseAdmin
    .from('agendamentos')
    .select('id')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', parsed.data.profissional_id)
    .neq('status', 'cancelado')
    .gte('data_hora', dataHora.toISOString())
    .lt('data_hora', fim.toISOString())
    .limit(1)

  if (conflito && conflito.length > 0) {
    res.status(409).json({ error: 'Horário já ocupado para este profissional' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('agendamentos')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }

  await supabaseAdmin
    .from('pacientes')
    .update({ status: 'consulta_agendada' })
    .eq('id', parsed.data.paciente_id)
    .eq('tenant_id', req.user!.tenant_id)

  res.status(201).json(data)
})

// IMPORTANT: define before PATCH /:id
router.get('/:id', async (req, res) => {
  const { id } = req.params

  const { data: ag, error } = await supabaseAdmin
    .from('agendamentos')
    .select(`
      *,
      servico:servicos(id, nome, preco, duracao_minutos),
      profissional:profissionais(id, nome),
      paciente:pacientes(id, nome, telefone)
    `)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()

  if (error || !ag) {
    res.status(404).json({ error: 'Agendamento não encontrado' })
    return
  }

  const { data: anteriores } = await supabaseAdmin
    .from('agendamentos')
    .select('data_hora')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', (ag as { paciente_id: string }).paciente_id)
    .in('status', ['confirmado', 'concluido'])
    .neq('id', id)
    .order('data_hora', { ascending: false })

  const contagem = (anteriores ?? []).length
  const ultima_data = (anteriores ?? [])[0]?.data_hora ?? null

  res.json({ ...ag, historico: { contagem, ultima_data } })
})

router.patch('/:id', async (req, res) => {
  const schema = z.object({
    data_hora: z.string().datetime().optional(),
    status: z.enum(['agendado', 'confirmado', 'cancelado', 'concluido']).optional(),
    notas: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  if (parsed.data.data_hora) {
    const dataHora = new Date(parsed.data.data_hora)
    if (!dentroDoExpediente(dataHora)) {
      res.status(400).json({ error: 'Horário fora do expediente (08:00–18:00)' })
      return
    }
  }

  const { data, error } = await supabaseAdmin
    .from('agendamentos')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

export default router
