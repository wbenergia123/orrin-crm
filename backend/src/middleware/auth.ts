// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { JWTPayload } from '../types'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string; impersonating?: boolean }
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

  // Verifica o JWT gerado pela rota /api/auth/login
  let payload: JWTPayload & { sub: string; impersonate_tenant_id?: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { sub: string; impersonate_tenant_id?: string }
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  // Busca role e tenant_id atualizados no banco
  const { data: userData } = await supabaseAdmin
    .from('usuarios')
    .select('role, tenant_id, nome')
    .eq('id', payload.sub)
    .single()

  // A claim de impersonação só é honrada se o papel REAL (do banco) for super_admin —
  // nunca confia em payload.role pra essa decisão.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const realRole = userData?.role || payload.role
  const realTenantId = userData?.tenant_id ?? payload.tenant_id
  const impersonating =
    realRole === 'super_admin' && !!payload.impersonate_tenant_id && UUID_REGEX.test(payload.impersonate_tenant_id)

  const user = {
    id: payload.sub,
    sub: payload.sub,
    email: payload.email,
    role: impersonating ? 'admin' : realRole,
    tenant_id: impersonating ? payload.impersonate_tenant_id! : realTenantId,
    nome: userData?.nome ?? payload.nome ?? null,
    impersonating,
  }

  if (user.role === 'super_admin') {
    req.user = user
    return next()
  }

  // Vercel rewrites externas não preservam o Host original; elas enviam X-Forwarded-Host.
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || ''
  const slug = host.split('.')[0]

  if (!slug || slug === 'admin') {
    return res.status(403).json({ error: 'Domínio inválido' })
  }

  const org = await getOrgBySlug(slug)
  if (!org || !org.ativo) {
    return res.status(403).json({ error: 'Organização não disponível' })
  }
  if (org.id !== user.tenant_id) {
    return res.status(403).json({ error: 'Token inválido para este domínio' })
  }

  req.user = user
  next()
}

// Super_admin sem tenant não tem dados de clínica; devolve [] em vez de 500.
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.tenant_id) {
    return res.json([])
  }
  next()
}

// Modo somente leitura: qualquer escrita durante impersonação é bloqueada.
// Precisa rodar depois de requireAuth (depende de req.user já estar preenchido).
export function blockWritesWhenImpersonating(req: Request, res: Response, next: NextFunction) {
  if (req.user?.impersonating && req.method !== 'GET') {
    return res.status(403).json({ error: 'Modo somente leitura — você está visualizando como esta clínica.' })
  }
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

// Gate do Studio 3D: só passa se a org do usuário tem o recurso habilitado.
// Precisa rodar depois de requireAuth. Super_admin passa sempre.
// ponytail: sem cache — 1 select por request; adicionar cache se virar hot path
export async function requireStudio3d(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'super_admin') return next()
  const { data } = await supabaseAdmin
    .from('organizacoes')
    .select('studio_3d_ativo')
    .eq('id', req.user!.tenant_id)
    .single()
  if (!data?.studio_3d_ativo) {
    return res.status(403).json({ error: 'Studio 3D não habilitado para esta clínica.' })
  }
  next()
}

// Vendedor vê só Pipeline (pacientes) e Atendimentos — bloqueia o resto por completo.
export function blockVendedor(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'vendedor') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  next()
}

// Produtos: vendedor só lê (usa o catálogo pra registrar interesse do cliente),
// não gerencia o cadastro — bloqueia apenas escrita.
export function blockVendedorWrites(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'vendedor' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Acesso negado' })
  }
  next()
}
