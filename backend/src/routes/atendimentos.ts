import { Router } from 'express'
import { supabaseAdmin } from '../services/supabase'
import { enviarMensagemViaUAZAPI } from '../lib/uazapi-client'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(id: string): boolean {
  return UUID_RE.test(id)
}

// ─── GET /resumo ─────────────────────────────────────────────────────────────

router.get('/resumo', async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca : undefined

  let pacientesQuery = supabaseAdmin
    .from('pacientes')
    .select('id, nome, telefone, status')
    .eq('tenant_id', req.user!.tenant_id)
    .not('ultimo_contato_at', 'is', null)
    .order('ultimo_contato_at', { ascending: false })
    .limit(50)

  if (busca) {
    const digits = busca.replace(/\D/g, '')
    if (digits) {
      pacientesQuery = pacientesQuery.or(`nome.ilike.%${busca}%,telefone.ilike.%${digits}%`)
    } else {
      pacientesQuery = pacientesQuery.ilike('nome', `%${busca}%`)
    }
  }

  const { data: pacientes, error: pacientesError } = await pacientesQuery
  if (pacientesError) { res.status(500).json({ error: pacientesError.message }); return }

  interface ConvRow {
    paciente_id: string
    mensagem_paciente: string | null
    mensagem_agente: string | null
    tipo_remetente: string | null
    modo_humano: boolean
    created_at: string
  }

  const patientIds = (pacientes ?? []).map((p) => p.id)
  let conversas: ConvRow[] = []

  if (patientIds.length > 0) {
    const { data: convData, error: convError } = await supabaseAdmin
      .from('conversas_pacientes')
      .select('paciente_id, mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, created_at')
      .eq('tenant_id', req.user!.tenant_id)
      .in('paciente_id', patientIds)
      .order('created_at', { ascending: false })
      .limit(500)

    if (convError) { res.status(500).json({ error: convError.message }); return }
    conversas = (convData ?? []) as ConvRow[]
  }

  const conversasPorPaciente = new Map<string, ConvRow[]>()
  for (const c of conversas) {
    const lista = conversasPorPaciente.get(c.paciente_id) ?? []
    lista.push(c)
    conversasPorPaciente.set(c.paciente_id, lista)
  }

  const resumos = (pacientes ?? []).map((p) => {
    const convs = conversasPorPaciente.get(p.id) ?? []

    const ultimaConversa = convs[0] ?? null
    const modoHumano = ultimaConversa?.modo_humano === true

    const ultimaMsgPaciente = convs.find((c) => c.mensagem_paciente)
    const ultimaMsgPacienteAt = ultimaMsgPaciente?.created_at ?? null

    const preview = ultimaMsgPaciente?.mensagem_paciente?.substring(0, 60) ?? ''

    const naoLidas =
      modoHumano &&
      ultimaConversa?.mensagem_paciente != null &&
      ultimaConversa?.mensagem_agente == null

    const unreadCount = convs.filter(
      (c) => c.mensagem_paciente != null && c.mensagem_agente == null
    ).length

    return {
      id: p.id,
      nome: p.nome,
      telefone: p.telefone,
      status: p.status,
      modo_humano: modoHumano,
      ultima_mensagem_preview: preview,
      ultima_mensagem_paciente_at: ultimaMsgPacienteAt,
      nao_lidas: naoLidas,
      unread_count: unreadCount,
    }
  }).sort((a, b) => {
    if (!a.ultima_mensagem_paciente_at) return 1
    if (!b.ultima_mensagem_paciente_at) return -1
    return (
      new Date(b.ultima_mensagem_paciente_at).getTime() -
      new Date(a.ultima_mensagem_paciente_at).getTime()
    )
  })

  res.json(resumos)
})

// ─── GET /:paciente_id/conversas ──────────────────────────────────────────────

router.get('/:paciente_id/conversas', async (req, res) => {
  if (!isValidUUID(req.params.paciente_id)) {
    res.status(400).json({ error: 'paciente_id inválido' })
    return
  }
  // Busca as 100 mais RECENTES (ordem descendente) e depois inverte — senão a
  // tela fica presa nas 100 mais antigas em conversas longas, sem mostrar o
  // que aconteceu depois (mesmo bug já corrigido no histórico usado pela Ana).
  const { data, error } = await supabaseAdmin
    .from('conversas_pacientes')
    .select('id, mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, remetente_nome, midia_url, midia_tipo, created_at')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', req.params.paciente_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json((data ?? []).reverse())
})

// ─── PATCH /:paciente_id/handoff ──────────────────────────────────────────────

router.patch('/:paciente_id/handoff', async (req, res) => {
  if (!isValidUUID(req.params.paciente_id)) {
    res.status(400).json({ error: 'paciente_id inválido' })
    return
  }
  const { modo_humano } = req.body
  if (typeof modo_humano !== 'boolean') {
    res.status(400).json({ error: 'modo_humano deve ser boolean' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('conversas_pacientes')
    .insert({
      tenant_id: req.user!.tenant_id,
      paciente_id: req.params.paciente_id,
      tipo_remetente: 'humano',
      modo_humano,
      mensagem_agente: modo_humano ? '[HANDOFF: secretária assumiu]' : '[HANDOFF: agente retomou]',
      remetente_nome: modo_humano ? req.user!.nome : null,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

// ─── POST /:paciente_id/mensagem ──────────────────────────────────────────────

router.post('/:paciente_id/mensagem', async (req, res) => {
  if (!isValidUUID(req.params.paciente_id)) {
    res.status(400).json({ error: 'paciente_id inválido' })
    return
  }
  const { texto } = req.body
  const { paciente_id } = req.params

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    res.status(400).json({ error: 'texto é obrigatório' })
    return
  }

  const { data: paciente, error: pacienteError } = await supabaseAdmin
    .from('pacientes')
    .select('telefone')
    .eq('id', paciente_id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()

  if (pacienteError || !paciente) {
    res.status(404).json({ error: 'Paciente não encontrado' })
    return
  }

  const { data: ultimaConversa } = await supabaseAdmin
    .from('conversas_pacientes')
    .select('modo_humano')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', paciente_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!ultimaConversa?.modo_humano) {
    res.status(400).json({ error: 'Paciente não está em modo humano' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('conversas_pacientes')
    .insert({
      tenant_id: req.user!.tenant_id,
      paciente_id,
      mensagem_agente: texto.trim(),
      tipo_remetente: 'humano',
      modo_humano: true,
      remetente_nome: req.user!.nome,
    })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  const entregue = await enviarMensagemViaUAZAPI({ tenantId: req.user!.tenant_id!, phone: paciente.telefone, text: texto.trim() }).catch(
    (err: unknown) => {
      console.error(`[ATENDIMENTOS] Falha ao enviar para paciente ${paciente_id} via UAZAPI:`, err)
      return false
    }
  )

  if (!entregue) {
    await supabaseAdmin.from('conversas_pacientes').insert({
      tenant_id: req.user!.tenant_id,
      paciente_id,
      tipo_remetente: 'humano',
      modo_humano: true,
      mensagem_agente: '[SISTEMA] Falha ao enviar esta mensagem pelo WhatsApp — verifique a conexão em Configurações.',
    })
  }

  res.status(201).json({ ...data, entregue })
})

export default router
