import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWTPayload } from '../types'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' })
    return
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}
