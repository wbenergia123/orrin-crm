// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { validarSlug } from '../lib/slug'
import { logAdminAction } from '../middleware/auth'

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
  const { slug, nome, admin_email, admin_senha } = req.body

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

router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: org, error } = await supabaseAdmin
    .from('organizacoes')
    .select('id, slug, nome, ativo')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !org) {
    return res.status(404).json({ error: 'Clínica não encontrada' })
  }

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
