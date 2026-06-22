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

  let query = supabaseAdmin
    .from('pacientes')
    .select(`
      id, nome, telefone, status,
      conversas_pacientes(mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, created_at)
    `)
    .eq('tenant_id', req.user!.tenant_id)
    .not('ultimo_contato_at', 'is', null)
    .order('ultimo_contato_at', { ascending: false })
    .limit(50)

  if (busca) {
    const digits = busca.replace(/\D/g, '')
    if (digits) {
      query = query.or(`nome.ilike.%${busca}%,telefone.ilike.%${digits}%`)
    } else {
      query = query.ilike('nome', `%${busca}%`)
    }
  }

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  interface ConvRow {
    mensagem_paciente: string | null
    mensagem_agente: string | null
    tipo_remetente: string | null
    modo_humano: boolean
    created_at: string
  }

  const resumos = (data ?? []).map((p) => {
    const convs = (p.conversas_pacientes as ConvRow[]).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

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
  const { data, error } = await supabaseAdmin
    .from('conversas_pacientes')
    .select('id, mensagem_paciente, mensagem_agente, tipo_remetente, modo_humano, created_at')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', req.params.paciente_id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
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
    })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  await enviarMensagemViaUAZAPI({ phone: paciente.telefone, text: texto.trim() }).catch(
    (err: unknown) => console.error(`[ATENDIMENTOS] Falha ao enviar para paciente ${paciente_id} via UAZAPI:`, err)
  )

  res.status(201).json(data)
})

export default router
