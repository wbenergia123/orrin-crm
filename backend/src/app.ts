import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import authRouter from './routes/auth'
import pacientesRouter from './routes/pacientes'
import servicosRouter from './routes/servicos'
import agendamentosRouter from './routes/agendamentos'
import atendimentosRouter from './routes/atendimentos'
import dashboardRouter from './routes/dashboard'
import profissionaisRouter from './routes/profissionais'
import configuracoesRouter from './routes/configuracoes'
import webhookRouter from './routes/webhook'
import whatsappRouter from './routes/whatsapp'
import { authMiddleware } from './middleware/auth'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // Webhook (sem autenticação JWT, usa token do UAZAPI)
  app.use('/webhook', webhookRouter)

  app.use('/api/auth', authRouter)

  // All routes below require authentication
  app.use('/api', authMiddleware)
  app.use('/api/pacientes', pacientesRouter)
  app.use('/api/servicos', servicosRouter)
  app.use('/api/agendamentos', agendamentosRouter)
  app.use('/api/atendimentos', atendimentosRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/profissionais', profissionaisRouter)
  app.use('/api/configuracoes', configuracoesRouter)
  app.use('/api/whatsapp', whatsappRouter)

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  return app
}
