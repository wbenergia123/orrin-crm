// backend/src/routes/auth.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.post('/login', async (req: Request, res: Response) => {
  const { email, senha } = req.body
  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }

  // Busca usuário pelo email
  const { data: usuario, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, senha_hash, role, tenant_id')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !usuario) {
    return res.status(401).json({ error: 'Email ou senha inválidos' })
  }

  // Verifica a senha
  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash)
  if (!senhaValida) {
    return res.status(401).json({ error: 'Email ou senha inválidos' })
  }

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

router.post('/register', async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Registro via API desativado. Use o painel admin.' })
})

export default router
