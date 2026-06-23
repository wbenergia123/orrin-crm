// backend/src/index.ts
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import clientesRouter from './routes/clientes'
import reunioesRouter from './routes/reunioes'
import webhookRouter from './routes/webhook'
import orgsRouter from './routes/orgs'
import adminRouter from './routes/admin'
import authRouter from './routes/auth'
import injetaveisRouter from './routes/injetaveis'
import marcacoesRouter from './routes/marcacoes'
import pacientesRouter from './routes/pacientes'
import servicosRouter from './routes/servicos'
import profissionaisRouter from './routes/profissionais'
import agendamentosRouter from './routes/agendamentos'
import atendimentosRouter from './routes/atendimentos'
import dashboardRouter from './routes/dashboard'
import whatsappRouter from './routes/whatsapp'
import configuracoesRouter from './routes/configuracoes'
import { requireAuth, requireTenant, requireSuperAdmin } from './middleware/auth'

dotenv.config()

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET é obrigatório. Defina a variável no .env ou no painel do host.')
}

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
app.use('/api/auth', authRouter)

// Webhook do WhatsApp — autenticado via tenantSlug na URL
app.use('/api/webhook', webhookRouter)

// Rotas de tenant (requerem auth + tenant válido)
app.use('/api/clientes', requireAuth, clientesRouter)
app.use('/api/reunioes', requireAuth, reunioesRouter)
app.use('/api/injetaveis', requireAuth, injetaveisRouter)
app.use('/api/marcacoes', requireAuth, marcacoesRouter)

// Rotas da clínica (super_admin sem tenant recebe [] para não dar 500)
app.use('/api/pacientes', requireAuth, requireTenant, pacientesRouter)
app.use('/api/servicos', requireAuth, requireTenant, servicosRouter)
app.use('/api/profissionais', requireAuth, requireTenant, profissionaisRouter)
app.use('/api/agendamentos', requireAuth, requireTenant, agendamentosRouter)
app.use('/api/atendimentos', requireAuth, requireTenant, atendimentosRouter)
app.use('/api/dashboard', requireAuth, dashboardRouter)
app.use('/api/whatsapp', requireAuth, whatsappRouter)
app.use('/api/configuracoes', requireAuth, configuracoesRouter)

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
