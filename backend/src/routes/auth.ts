// backend/src/routes/auth.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'
import { verificarBloqueio, registrarFalha, registrarSucesso } from '../lib/rate-limiter'

const router = Router()

router.post('/login', async (req: Request, res: Response) => {
  const { email, senha } = req.body
  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }

  const emailNorm = email.toLowerCase().trim()

  // Verifica bloqueio por tentativas
  const bloqueio = verificarBloqueio(emailNorm)
  if (bloqueio.bloqueado) {
    return res.status(429).json({
      error: `Muitas tentativas incorretas. Tente novamente em ${bloqueio.segundosRestantes} segundos.`,
    })
  }

  // Busca usuário pelo email
  const { data: usuario, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, senha_hash, role, tenant_id, ativo')
    .eq('email', emailNorm)
    .single()

  if (error || !usuario) {
    registrarFalha(emailNorm)
    return res.status(401).json({ error: 'Email ou senha inválidos' })
  }

  // Verifica a senha
  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash)
  if (!senhaValida) {
    registrarFalha(emailNorm)
    return res.status(401).json({ error: 'Email ou senha inválidos' })
  }

  if (usuario.ativo === false) {
    return res.status(401).json({ error: 'Usuário desativado. Entre em contato com o suporte.' })
  }

  if (usuario.role !== 'super_admin' && usuario.tenant_id) {
    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('ativo')
      .eq('id', usuario.tenant_id)
      .single()

    if (!org || !org.ativo) {
      return res.status(401).json({ error: 'Esta clínica está desativada. Entre em contato com o suporte.' })
    }
  }

  registrarSucesso(emailNorm)

  // Gera JWT
  const token = jwt.sign(
    { sub: usuario.id, email: usuario.email, role: usuario.role, tenant_id: usuario.tenant_id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )

  res.json({
    token,
    usuario: { id: usuario.id, email: usuario.email, role: usuario.role },
  })
})

router.get('/me', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'Token ausente' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; email: string; role: string }
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, role, tenant_id, ativo')
      .eq('id', payload.sub)
      .single()

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: 'Usuário inválido ou desativado' })
    }

    res.json({ usuario })
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
})

router.post('/register', async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Registro via API desativado. Use o painel admin.' })
})

export default router
