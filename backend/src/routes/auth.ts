import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { supabase } from '../db/supabase'
import { authMiddleware } from '../middleware/auth'
import { JWTPayload } from '../types'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Email ou senha inválidos' })
    return
  }

  const { email, senha } = parsed.data

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, email, senha_hash, role')
    .eq('email', email)
    .single()

  if (error || !usuario) {
    res.status(401).json({ error: 'Credenciais inválidas' })
    return
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash)
  if (!senhaValida) {
    res.status(401).json({ error: 'Credenciais inválidas' })
    return
  }

  const payload: JWTPayload = { sub: usuario.id, email: usuario.email, role: usuario.role }
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' })

  res.json({ token, usuario: { id: usuario.id, email: usuario.email, role: usuario.role } })
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ usuario: req.user })
})

export default router
