import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'
import { somarMinutosTextoLocal } from '../lib/datetime-local'

const router = Router()

const HORA_INICIO = 8   // 08:00
const HORA_FIM = 18     // 18:00
const DURACAO_MIN = 60

// data_hora é uma coluna TIMESTAMP (sem timezone) — texto local puro. Nunca passa
// por Date/timezone aqui, senão o horário desloca conforme o fuso do processo.
function gerarSlots(dataStr: string): { textoLocal: string; hora: string }[] {
  const slots: { textoLocal: string; hora: string }[] = []
  for (let h = HORA_INICIO; h < HORA_FIM; h++) {
    const hora = `${String(h).padStart(2, '0')}:00`
    slots.push({ textoLocal: `${dataStr}T${hora}:00`, hora })
  }
  return slots
}

function dentroDoExpediente(textoLocal: string): boolean {
  const hora = parseInt(textoLocal.substring(11, 13), 10)
  const minuto = parseInt(textoLocal.substring(14, 16), 10)
  const totalMin = hora * 60 + minuto
  return totalMin >= HORA_INICIO * 60 && totalMin + DURACAO_MIN <= HORA_FIM * 60
}

function normalizarTextoLocal(dataHora: string): string {
  return dataHora.replace(/(Z|[+-]\d{2}:\d{2})$/, '')
}

// IMPORTANT: /slots-disponiveis must be defined BEFORE /:id so Express doesn't treat "slots-disponiveis" as an id
router.get('/slots-disponiveis', async (req, res) => {
  const { data: dataParam, profissional_id, servico_id } = req.query
  if (!dataParam || !profissional_id) {
    res.status(400).json({ error: 'data e profissional_id são obrigatórios' })
    return
  }

  const dataStr = dataParam as string

  // Se servico_id fornecido, verifica se este profissional realiza o serviço
  if (servico_id) {
    const { data: vinculo } = await supabaseAdmin
      .from('profissional_servicos')
      .select('profissional_id')
      .eq('profissional_id', profissional_id as string)
      .eq('servico_id', servico_id as string)
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle()

    const { data: temQualquerServico } = await supabaseAdmin
      .from('profissional_servicos')
      .select('profissional_id')
      .eq('profissional_id', profissional_id as string)
      .eq('tenant_id', req.user!.tenant_id)
      .limit(1)

    if (!vinculo && (temQualquerServico ?? []).length > 0) {
      const todos = gerarSlots(dataStr)
      res.json(todos.map((s) => ({ iso: `${s.textoLocal}-03:00`, hora: s.hora, disponivel: false })))
      return
    }
  }

  const { data: ocupados } = await supabaseAdmin
    .from('agendamentos')
    .select('data_hora')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', profissional_id)
    .neq('status', 'cancelado')
    .gte('data_hora', `${dataStr}T00:00:00`)
    .lte('data_hora', `${dataStr}T23:59:59`)

  const { data: bloqueios } = await supabaseAdmin
    .from('bloqueios_agenda')
    .select('data_hora_inicio, data_hora_fim')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', profissional_id)
    .gte('data_hora_inicio', `${dataStr}T00:00:00`)
    .lte('data_hora_inicio', `${dataStr}T23:59:59`)

  const horariosOcupados = new Set(
    (ocupados ?? []).map((a) => a.data_hora.substring(11, 16))
  )

  const bloqueioIntervalos = (bloqueios ?? []).map((b) => ({
    inicio: b.data_hora_inicio,
    fim: b.data_hora_fim,
  }))

  const todos = gerarSlots(dataStr)

  res.json(todos.map((s) => {
    const bloqueado = bloqueioIntervalos.some(
      (b) => s.textoLocal >= b.inicio && s.textoLocal < b.fim
    )
    return {
      iso: `${s.textoLocal}-03:00`,
      hora: s.hora,
      disponivel: !horariosOcupados.has(s.hora) && !bloqueado,
    }
  }))
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
  data_hora: z.string().datetime({ offset: true }),
  notas: z.string().optional(),
})

router.post('/', async (req, res) => {
  const parsed = agendamentoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const dataHoraNorm = normalizarTextoLocal(parsed.data.data_hora)
  if (!dentroDoExpediente(dataHoraNorm)) {
    res.status(400).json({ error: 'Horário fora do expediente (08:00–18:00)' })
    return
  }

  const fim = somarMinutosTextoLocal(dataHoraNorm, DURACAO_MIN)
  const { data: conflito } = await supabaseAdmin
    .from('agendamentos')
    .select('id')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('profissional_id', parsed.data.profissional_id)
    .neq('status', 'cancelado')
    .gte('data_hora', dataHoraNorm)
    .lt('data_hora', fim)
    .limit(1)

  if (conflito && conflito.length > 0) {
    res.status(409).json({ error: 'Horário já ocupado para este profissional' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('agendamentos')
    .insert({ ...parsed.data, data_hora: dataHoraNorm, tenant_id: req.user!.tenant_id })
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
    data_hora: z.string().datetime({ offset: true }).optional(),
    status: z.enum(['agendado', 'confirmado', 'cancelado', 'concluido']).optional(),
    notas: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  let dataHoraNorm: string | undefined
  if (parsed.data.data_hora) {
    dataHoraNorm = normalizarTextoLocal(parsed.data.data_hora)
    if (!dentroDoExpediente(dataHoraNorm)) {
      res.status(400).json({ error: 'Horário fora do expediente (08:00–18:00)' })
      return
    }
  }

  const { data, error } = await supabaseAdmin
    .from('agendamentos')
    .update({ ...parsed.data, ...(dataHoraNorm ? { data_hora: dataHoraNorm } : {}) })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

export default router
