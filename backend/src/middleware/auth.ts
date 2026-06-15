// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { JWTPayload } from '../types'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string }
    }
  }
}

// Cache simples de org por slug (evita hit no DB a cada request)
const orgCache = new Map<string, { id: string; ativo: boolean; expires: number }>()

async function getOrgBySlug(slug: string) {
  const cached = orgCache.get(slug)
  if (cached && cached.expires > Date.now()) return cached

  const { data } = await supabaseAdmin
    .from('organizacoes')
    .select('id, ativo')
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (data) {
    orgCache.set(slug, { ...data, expires: Date.now() + 60_000 })
  }
  return data
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'Token ausente' })
  }

  let payload: JWTPayload & { sub: string }
  try {
    payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as any
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  if (payload.role === 'super_admin') {
    req.user = { id: payload.sub, ...payload }
    return next()
  }

  const host = req.headers.host || ''
  const slug = host.split('.')[0]

  if (!slug || slug === 'admin') {
    return res.status(403).json({ error: 'Domínio inválido' })
  }

  const org = await getOrgBySlug(slug)
  if (!org || !org.ativo) {
    return res.status(403).json({ error: 'Organização não disponível' })
  }
  if (org.id !== payload.tenant_id) {
    return res.status(403).json({ error: 'Token inválido para este domínio' })
  }

  req.user = { id: payload.sub, ...payload }
  next()
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  next()
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetId?: string,
  metadata?: object
) {
  await supabaseAdmin.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_id: targetId,
    metadata,
  })
}
