// backend/src/index.ts
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import clientesRouter from './routes/clientes'
import reunioesRouter from './routes/reunioes'
import webhookRouter from './routes/webhook'
import orgsRouter from './routes/orgs'
import adminRouter from './routes/admin'
import { requireAuth, requireSuperAdmin } from './middleware/auth'

dotenv.config()

const app = express()

app.use(express.json())

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const ok =
      /^https:\/\/([a-z0-9-]+\.)?orrin\.com\.br$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin)
    cb(ok ? null : new Error('CORS bloqueado'), ok)
  },
  credentials: true,
}))

// Rotas públicas (sem auth)
app.use('/api/orgs', orgsRouter)

// Webhook do WhatsApp — autenticado via tenantSlug na URL
app.use('/api/webhook', webhookRouter)

// Rotas de tenant (requerem auth + tenant válido)
app.use('/api/clientes', requireAuth, clientesRouter)
app.use('/api/reunioes', requireAuth, reunioesRouter)

// Rotas super admin
app.use('/api/admin', requireAuth, requireSuperAdmin, adminRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`)
})

export default app
