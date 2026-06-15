// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express'
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
  const { slug, nome, admin_email } = req.body

  if (!slug || !nome || !admin_email) {
    return res.status(400).json({ error: 'slug, nome e admin_email são obrigatórios' })
  }

  try {
    validarSlug(slug)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }

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

  try {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      admin_email,
      {
        data: { tenant_id: org.id, role: 'admin' },
        redirectTo: `https://${slug}.orrin.com/set-password`,
      }
    )
    if (inviteError) throw inviteError
  } catch (err: any) {
    await supabaseAdmin.from('organizacoes').delete().eq('id', org.id)
    return res.status(400).json({ error: `Falha ao enviar invite: ${err.message}` })
  }

  await logAdminAction(req.user!.id, 'create_org', org.id, { slug, nome, admin_email })

  res.status(201).json({
    org: { id: org.id, slug: org.slug, nome: org.nome },
    url: `https://${slug}.orrin.com`,
    invite_enviado: true,
  })
})

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { ativo } = req.body

  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ error: 'Campo ativo (boolean) é obrigatório' })
  }

  const updateData: any = { ativo }
  if (!ativo) updateData.deleted_at = new Date().toISOString()
  else updateData.deleted_at = null

  const { data, error } = await supabaseAdmin
    .from('organizacoes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await logAdminAction(req.user!.id, ativo ? 'activate_org' : 'deactivate_org', id)

  res.json(data)
})

export default router
