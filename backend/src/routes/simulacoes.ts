// backend/src/routes/simulacoes.ts
// Studio 3D — simulação estética facial. Spec: docs/superpowers/specs/2026-07-09-studio-3d-estetico-design.md
import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
const BUCKET = 'simulacoes-3d'

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

router.get('/', async (req: Request, res: Response) => {
  const pacienteId = req.query.paciente_id
  if (!pacienteId || typeof pacienteId !== 'string') {
    res.status(400).json({ error: 'paciente_id é obrigatório' }); return
  }
  const { data, error } = await supabaseAdmin
    .from('simulacoes_3d')
    .select('id, paciente_id, status, criado_em, atualizado_em, notas, thumbnail_path, screenshot_path')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', pacienteId)
    .order('criado_em', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }

  const comUrls = await Promise.all((data ?? []).map(async (s) => ({
    ...s,
    thumbnail_url: await signedUrl(s.thumbnail_path),
    screenshot_url: await signedUrl(s.screenshot_path),
  })))
  res.json(comUrls)
})

export default router
