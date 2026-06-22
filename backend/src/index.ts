import 'dotenv/config'
import cron from 'node-cron'
import { createApp } from './app'
import { executarLembretes } from './jobs/confirmacao-agendamentos'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET é obrigatório. Defina a variável no .env ou no painel do host.')
}

const port = process.env.PORT ?? 3001
const app = createApp()

// Lembretes de confirmação todo dia às 8h no fuso de São Paulo
cron.schedule('0 8 * * *', executarLembretes, { timezone: 'America/Sao_Paulo' })

app.listen(port, () => {
  console.log(`Backend rodando na porta ${port}`)
})
