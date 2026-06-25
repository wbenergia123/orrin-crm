// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { validarSlug } from '../lib/slug'
import { logAdminAction } from '../middleware/auth'
import { invalidarCachePrompt } from '../lib/claude-agent'

const router = Router()

router.get('/tenants', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, slug, nome, ativo, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.post('/tenants', async (req: Request, res: Response) => {
  const { slug, nome, admin_email, admin_senha, uazapi_url, uazapi_token } = req.body

  if (!slug || !nome || !admin_email) {
    return res.status(400).json({ error: 'slug, nome e admin_email são obrigatórios' })
  }

  try {
    validarSlug(slug)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }

  const senha = typeof admin_senha === 'string' && admin_senha.trim()
    ? admin_senha.trim()
    : 'senha123'

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizacoes')
    .insert({ slug: slug.toLowerCase(), nome })
    .select()
    .single()

  if (orgError) {
    if (orgError.code === '23505') {
      return res.status(409).json({ error: 'Slug já está em uso' })
    }
    return res.status(400).json({ error: orgError.message })
  }

  const { error: userError } = await supabaseAdmin
    .from('usuarios')
    .insert({
      email: admin_email.toLowerCase().trim(),
      senha_hash: await bcrypt.hash(senha, 10),
      role: 'admin',
      tenant_id: org.id,
    })

  if (userError) {
    await supabaseAdmin.from('organizacoes').delete().eq('id', org.id)
    return res.status(400).json({ error: `Falha ao criar usuário admin: ${userError.message}` })
  }

  await supabaseAdmin.from('followup_regras').insert([
    { tenant_id: org.id, nome: 'Lembrete 24h', gatilho: 'lembrete_agendamento', delay_minutos: 24 * 60, template: 'Oi [nome], amanhã você tem [servico] às [hora]. Confirma?', ativo: true, ordem_prioridade: 10 },
    { tenant_id: org.id, nome: 'Não respondeu', gatilho: 'nao_respondeu', delay_minutos: 60, template: 'Oi [nome], vi que você entrou em contato. Ainda tem interesse em marcar?', ativo: true, ordem_prioridade: 5 },
    { tenant_id: org.id, nome: 'No-show', gatilho: 'no_show', delay_minutos: 30, template: 'Oi [nome], vi que não conseguiu vir hoje. Quer remarcar?', ativo: true, ordem_prioridade: 8 },
    { tenant_id: org.id, nome: 'Lembrete do dia', gatilho: 'lembrete_dia', horario_fixo: '08:00', template: 'Oi [nome], hoje você tem [servico] às [hora] com [profissional]. Te esperamos!', ativo: true, ordem_prioridade: 12 },
  ])

  const configRows: { tenant_id: string; chave: string; valor: string }[] = []
  if (typeof uazapi_url === 'string' && uazapi_url.trim()) {
    configRows.push({ tenant_id: org.id, chave: 'uazapi_url', valor: uazapi_url.trim() })
  }
  if (typeof uazapi_token === 'string' && uazapi_token.trim()) {
    configRows.push({ tenant_id: org.id, chave: 'uazapi_token', valor: uazapi_token.trim() })
  }
  if (configRows.length > 0) {
    const { error: configError } = await supabaseAdmin
      .from('configuracoes')
      .upsert(configRows, { onConflict: 'tenant_id,chave' })
    if (configError) {
      console.error('[admin] Falha ao salvar configurações UAZAPI:', configError.message)
    }
  }

  await logAdminAction(req.user!.id, 'create_org', org.id, { slug, nome, admin_email })

  res.status(201).json({
    org: { id: org.id, slug: org.slug, nome: org.nome },
    url: `https://${slug}.orrin.com.br`,
    admin_email: admin_email.toLowerCase().trim(),
    admin_senha: senha,
  })
})

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { ativo } = req.body

  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ error: 'Campo ativo (boolean) é obrigatório' })
  }

  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .update({ ativo })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await logAdminAction(req.user!.id, ativo ? 'activate_org' : 'deactivate_org', id)

  res.json(data)
})

router.post('/tenants/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizacoes')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (orgError) {
    return res.status(400).json({ error: orgError.message })
  }

  const { error: userError } = await supabaseAdmin
    .from('usuarios')
    .update({ ativo: false })
    .eq('tenant_id', id)

  if (userError) {
    return res.status(400).json({ error: userError.message })
  }

  await logAdminAction(req.user!.id, 'cancel_org', id)

  res.json({ org })
})

router.get('/tenants/:id/uazapi', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: rows, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor')
    .eq('tenant_id', id)
    .in('chave', ['uazapi_url', 'uazapi_token'])

  if (error) return res.status(400).json({ error: error.message })

  const map = Object.fromEntries((rows ?? []).map((r) => [r.chave, r.valor]))
  res.json({
    uazapi_url: map['uazapi_url'] || '',
    uazapi_token: map['uazapi_token'] || '',
  })
})

router.patch('/tenants/:id/uazapi', async (req: Request, res: Response) => {
  const { id } = req.params
  const { uazapi_url, uazapi_token } = req.body

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizacoes')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (orgError || !org) {
    return res.status(404).json({ error: 'Clínica não encontrada' })
  }

  const updates: { tenant_id: string; chave: string; valor: string }[] = []
  if (typeof uazapi_url === 'string' && uazapi_url.trim()) {
    updates.push({ tenant_id: id, chave: 'uazapi_url', valor: uazapi_url.trim() })
  }
  if (typeof uazapi_token === 'string' && uazapi_token.trim()) {
    updates.push({ tenant_id: id, chave: 'uazapi_token', valor: uazapi_token.trim() })
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'uazapi_url ou uazapi_token são obrigatórios' })
  }

  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert(updates, { onConflict: 'tenant_id,chave' })

  if (error) return res.status(400).json({ error: error.message })

  await logAdminAction(req.user!.id, 'update_uazapi_config', id, { uazapi_url, uazapi_token })

  res.json({ success: true })
})

router.get('/tenants/:id/prompt', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor')
    .eq('tenant_id', id)
    .in('chave', ['prompt_ana', 'ana_model'])

  if (error) return res.status(400).json({ error: error.message })

  const map = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]))
  res.json({
    prompt_ana: map['prompt_ana'] || '',
    ana_model: map['ana_model'] || '',
  })
})

router.patch('/tenants/:id/prompt', async (req: Request, res: Response) => {
  const { id } = req.params
  const { prompt_ana, ana_model } = req.body

  // Os dois campos são opcionais — só atualiza o que realmente veio na request,
  // pra dar pra editar prompt e modelo separadamente sem apagar o outro.
  const updates: { tenant_id: string; chave: string; valor: string }[] = []
  if (typeof prompt_ana === 'string') updates.push({ tenant_id: id, chave: 'prompt_ana', valor: prompt_ana })
  if (typeof ana_model === 'string') updates.push({ tenant_id: id, chave: 'ana_model', valor: ana_model })

  if (updates.length === 0) {
    return res.status(400).json({ error: 'prompt_ana ou ana_model são obrigatórios' })
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizacoes')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (orgError || !org) {
    return res.status(404).json({ error: 'Clínica não encontrada' })
  }

  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert(updates, { onConflict: 'tenant_id,chave' })

  if (error) return res.status(400).json({ error: error.message })

  invalidarCachePrompt(id)
  await logAdminAction(req.user!.id, 'update_prompt_ana', id)

  res.json({ success: true })
})

router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {
  const { id } = req.params

  // ativo não é checado aqui de propósito: se a clínica estiver desativada, o token
  // ainda é emitido, mas o 403 de "Organização não disponível" já acontece em
  // requireAuth na primeira request real (mesma checagem usada pra qualquer usuário).
  const { data: org, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, slug, nome, ativo')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !org) {
    return res.status(404).json({ error: 'Clínica não encontrada' })
  }

  // tenant_id fica null: o tenant efetivo durante a impersonação vem da claim
  // impersonate_tenant_id, resolvida em requireAuth — não trocar esse null por org.id.
  const token = jwt.sign(
    {
      sub: req.user!.id,
      email: req.user!.email,
      role: 'super_admin',
      tenant_id: null,
      impersonate_tenant_id: org.id,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  )

  await logAdminAction(req.user!.id, 'impersonate_org', org.id)

  res.json({
    token,
    org: { id: org.id, slug: org.slug, nome: org.nome },
  })
})

export default router
