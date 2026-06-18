import { Router } from 'express'

const router = Router()

function getUazapiBase(): string | null {
  return process.env.UAZAPI_URL ?? null
}

function getUazapiToken(): string {
  return process.env.UAZAPI_TOKEN ?? ''
}

router.get('/status', async (_req, res) => {
  const base = getUazapiBase()
  if (!base) {
    res.json({ state: 'disconnected', error: 'UAZAPI_URL não configurada' })
    return
  }

  try {
    const response = await fetch(`${base}/instance/status`, {
      headers: { token: getUazapiToken() },
    })
    const data = await response.json() as { instance?: { status?: string; owner?: string }; status?: { connected?: boolean } }
    const connected = data.status?.connected || data.instance?.status === 'connected'
    const phone = data.instance?.owner ?? undefined
    res.json({
      state: connected ? 'connected' : 'disconnected',
      phone,
    })
  } catch {
    res.json({ state: 'disconnected', error: true })
  }
})

router.post('/connect', async (_req, res) => {
  const base = getUazapiBase()
  if (!base) {
    res.status(503).json({ error: 'UAZAPI_URL não configurada' })
    return
  }

  try {
    const response = await fetch(`${base}/instance/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: getUazapiToken() },
      body: JSON.stringify({}),
    })
    const data = await response.json() as { instance?: { qrcode?: string; status?: string }; connected?: boolean; response?: string }
    const qrcode = data.instance?.qrcode ?? null
    const alreadyConnected = data.connected === true || data.response === 'Already connected'
    res.json({ qrcode, alreadyConnected })
  } catch (err) {
    res.status(502).json({ error: 'Falha ao conectar com UAZAPI', detalhes: String(err) })
  }
})

router.post('/disconnect', async (_req, res) => {
  const base = getUazapiBase()
  if (!base) {
    res.status(503).json({ error: 'UAZAPI_URL não configurada' })
    return
  }

  try {
    const response = await fetch(`${base}/instance/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: getUazapiToken() },
      body: JSON.stringify({}),
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'Falha ao desconectar', detalhes: String(err) })
  }
})

// Cache em memória para fotos — TTL 30min
const photoCache = new Map<string, { image: string; name: string; ts: number }>()
const PHOTO_TTL = 30 * 60 * 1000

router.get('/contact-photo', async (req, res) => {
  const phone = typeof req.query.phone === 'string' ? req.query.phone.replace(/\D/g, '') : ''
  if (!phone) { res.status(400).json({ error: 'phone obrigatório' }); return }

  const cached = photoCache.get(phone)
  if (cached && Date.now() - cached.ts < PHOTO_TTL) {
    res.json({ image: cached.image, name: cached.name }); return
  }

  const base = getUazapiBase()
  if (!base) { res.json({ image: '', name: '' }); return }

  try {
    const response = await fetch(`${base}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: getUazapiToken() },
      body: JSON.stringify({ number: phone, preview: true }),
    })
    const data = await response.json() as { image?: string; imagePreview?: string; name?: string; wa_name?: string }
    const image = data.imagePreview || data.image || ''
    const name = data.name || data.wa_name || ''
    photoCache.set(phone, { image, name, ts: Date.now() })
    res.json({ image, name })
  } catch {
    res.json({ image: '', name: '' })
  }
})

export default router
