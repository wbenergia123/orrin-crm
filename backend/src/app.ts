// backend/src/app.ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import clientesRouter from './routes/clientes'
import reunioesRouter from './routes/reunioes'
import webhookRouter from './routes/webhook'
import orgsRouter from './routes/orgs'
import adminRouter from './routes/admin'
import authRouter from './routes/auth'
import injetaveisRouter from './routes/injetaveis'
import marcacoesRouter from './routes/marcacoes'
import pacientesRouter from './routes/pacientes'
import produtosRouter from './routes/produtos'
import servicosRouter from './routes/servicos'
import profissionaisRouter from './routes/profissionais'
import agendamentosRouter from './routes/agendamentos'
import atendimentosRouter from './routes/atendimentos'
import dashboardRouter from './routes/dashboard'
import whatsappRouter from './routes/whatsapp'
import configuracoesRouter from './routes/configuracoes'
import followupRouter from './routes/followup'
import imagensReferenciaRouter from './routes/imagens-referencia'
import financeiroRouter from './routes/financeiro'
import bloqueiosRouter from './routes/bloqueios'
import simulacoesRouter from './routes/simulacoes'
import despesasRouter from './routes/despesas'
import reunioesAgroRouter from './routes/reunioes-agro'
import { requireAdminOuSuperAdmin } from './routes/financeiro'
import { requireAuth, requireTenant, requireSuperAdmin, blockWritesWhenImpersonating, requireStudio3d, blockVendedor, blockVendedorWrites } from './middleware/auth'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET é obrigatório. Defina a variável no .env ou no painel do host.')
}

export function createApp() {
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
  app.use('/api/clientes', requireAuth, blockWritesWhenImpersonating, blockVendedor, clientesRouter)
  app.use('/api/reunioes', requireAuth, blockWritesWhenImpersonating, blockVendedor, reunioesRouter)
  app.use('/api/injetaveis', requireAuth, blockWritesWhenImpersonating, blockVendedor, injetaveisRouter)
  app.use('/api/marcacoes', requireAuth, blockWritesWhenImpersonating, blockVendedor, marcacoesRouter)

  // Rotas da clínica (super_admin sem tenant recebe [] para não dar 500)
  app.use('/api/pacientes', requireAuth, blockWritesWhenImpersonating, requireTenant, pacientesRouter)
  app.use('/api/produtos', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedorWrites, produtosRouter)
  app.use('/api/servicos', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, servicosRouter)
  app.use('/api/profissionais', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, profissionaisRouter)
  app.use('/api/agendamentos', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, agendamentosRouter)
  app.use('/api/atendimentos', requireAuth, blockWritesWhenImpersonating, requireTenant, atendimentosRouter)
  app.use('/api/dashboard', requireAuth, blockWritesWhenImpersonating, blockVendedor, dashboardRouter)
  app.use('/api/financeiro', requireAuth, blockWritesWhenImpersonating, financeiroRouter)
  // Vendedor precisa do GET /contact-photo (avatares em Atendimentos), mas não pode
  // conectar/desconectar o WhatsApp do tenant (connect/disconnect são POST).
  app.use('/api/whatsapp', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedorWrites, whatsappRouter)
  app.use('/api/configuracoes', requireAuth, blockWritesWhenImpersonating, blockVendedor, configuracoesRouter)
  app.use('/api/followup', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, followupRouter)
  app.use('/api/imagens-referencia', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, imagensReferenciaRouter)
  app.use('/api/bloqueios', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, bloqueiosRouter)
  app.use('/api/simulacoes', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, requireStudio3d, simulacoesRouter)
  app.use('/api/despesas', requireAuth, blockWritesWhenImpersonating, requireTenant, requireAdminOuSuperAdmin, despesasRouter)
  app.use('/api/reunioes-agro', requireAuth, blockWritesWhenImpersonating, requireTenant, blockVendedor, reunioesAgroRouter)

  // Rotas super admin
  app.use('/api/admin', requireAuth, requireSuperAdmin, adminRouter)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' })
  })

  return app
}
