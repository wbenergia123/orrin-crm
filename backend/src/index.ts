// backend/src/index.ts
import { createApp } from './app'
import { runFollowups } from './lib/followup-runner'

const app = createApp()

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`)
})

// Job de follow-up automático: roda a cada 5 minutos
const INTERVALO_FOLLOWUP_MS = 5 * 60 * 1000
setInterval(() => {
  runFollowups().catch((err) => console.error('[followup] Erro no job:', err))
}, INTERVALO_FOLLOWUP_MS)

runFollowups().catch((err) => console.error('[followup] Erro na primeira execução:', err))
