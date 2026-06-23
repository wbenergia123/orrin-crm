// backend/src/index.ts
import { createApp } from './app'
import { runFollowups } from './lib/followup-runner'

const app = createApp()

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`)
})

// Job de follow-up automático: roda a cada 5 minutos.
// Exige opt-in explícito (ENABLE_FOLLOWUP_JOB=true) — sem isso, "npm run dev" local
// usando credenciais reais do Supabase/UAZAPI dispararia WhatsApp de verdade pros pacientes.
if (process.env.ENABLE_FOLLOWUP_JOB === 'true') {
  const INTERVALO_FOLLOWUP_MS = 5 * 60 * 1000
  setInterval(() => {
    runFollowups().catch((err) => console.error('[followup] Erro no job:', err))
  }, INTERVALO_FOLLOWUP_MS)

  runFollowups().catch((err) => console.error('[followup] Erro na primeira execução:', err))
} else {
  console.log('[followup] Job desativado (defina ENABLE_FOLLOWUP_JOB=true para ativar)')
}
