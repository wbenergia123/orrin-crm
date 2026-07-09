// backend/src/routes/simulacoes.ts
// Studio 3D — simulação estética facial. Spec: docs/superpowers/specs/2026-07-09-studio-3d-estetico-design.md
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'
import { criarTask, consultarTask, baixarArquivo } from '../lib/meshy'

const router = Router()
const BUCKET = 'simulacoes-3d'
const CREDITOS_POR_GERACAO = 30
const TIMEOUT_GERACAO_MS = 10 * 60 * 1000
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const TIPOS_FOTO = ['image/jpeg', 'image/png']

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

router.get('/:id', async (req: Request, res: Response) => {
  const { data: sim, error } = await supabaseAdmin.from('simulacoes_3d')
    .select('*').eq('id', req.params.id).eq('tenant_id', req.user!.tenant_id).single()
  if (error || !sim) { res.status(404).json({ error: 'Simulação não encontrada' }); return }

  let atual = sim
  let progress: number | undefined

  if ((sim.status === 'pending' || sim.status === 'processing') && sim.meshy_task_id) {
    try {
      const task = await consultarTask(sim.meshy_task_id)
      progress = task.progress

      if (task.status === 'SUCCEEDED' && task.model_urls?.glb) {
        // Baixa AGORA (URL da Meshy expira) e persiste no nosso bucket ANTES de marcar succeeded
        const glb = await baixarArquivo(task.model_urls.glb)
        const glbPath = `${sim.tenant_id}/${sim.id}/modelo.glb`
        const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
          .upload(glbPath, glb, { contentType: 'model/gltf-binary', upsert: true })
        if (upErr) throw new Error(upErr.message)

        let thumbPath: string | null = null
        if (task.thumbnail_url) {
          try {
            const thumb = await baixarArquivo(task.thumbnail_url)
            thumbPath = `${sim.tenant_id}/${sim.id}/thumbnail.png`
            await supabaseAdmin.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: 'image/png', upsert: true })
          } catch { /* thumbnail é opcional */ }
        }

        const { data } = await supabaseAdmin.from('simulacoes_3d')
          .update({ status: 'succeeded', modelo_glb_path: glbPath, thumbnail_path: thumbPath, atualizado_em: new Date().toISOString() })
          .eq('id', sim.id).select().single()
        atual = data
      } else if (task.status === 'FAILED') {
        const { data } = await supabaseAdmin.from('simulacoes_3d')
          .update({ status: 'failed', creditos_consumidos: 0, atualizado_em: new Date().toISOString() })
          .eq('id', sim.id).select().single()
        atual = data
      } else {
        // ainda gerando — timeout de segurança
        const idade = Date.now() - new Date(sim.criado_em).getTime()
        if (idade > TIMEOUT_GERACAO_MS) {
          const { data } = await supabaseAdmin.from('simulacoes_3d')
            .update({ status: 'failed', atualizado_em: new Date().toISOString() }).eq('id', sim.id).select().single()
          atual = data
        } else if (sim.status === 'pending') {
          const { data } = await supabaseAdmin.from('simulacoes_3d')
            .update({ status: 'processing' }).eq('id', sim.id).select().single()
          atual = data
        }
      }
    } catch {
      // erro transitório de rede com a Meshy: mantém o estado, o front tenta de novo no próximo poll
    }
  }

  res.json({
    ...atual,
    progress,
    modelo_glb_url: await signedUrl(atual.modelo_glb_path),
    thumbnail_url: await signedUrl(atual.thumbnail_path),
    screenshot_url: await signedUrl(atual.screenshot_path),
  })
})

router.post('/', (req: Request, res: Response, next) => {
  upload.array('fotos', 4)(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Foto muito grande (máx. 10MB)' : 'Erro no upload'
      res.status(400).json({ error: msg }); return
    }
    next()
  })
}, async (req: Request, res: Response) => {
  const parsed = z.object({
    paciente_id: z.string().uuid(),
    forcar_geracao: z.coerce.boolean().optional().default(false),
  }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { paciente_id, forcar_geracao } = parsed.data
  const tenantId = req.user!.tenant_id

  const { data: paciente } = await supabaseAdmin.from('pacientes')
    .select('id').eq('id', paciente_id).eq('tenant_id', tenantId).single()
  if (!paciente) { res.status(404).json({ error: 'Paciente não encontrado' }); return }

  // Clone: paciente já tem modelo succeeded e não pediu regeneração → sem Meshy, custo zero
  if (!forcar_geracao) {
    const { data: origem } = await supabaseAdmin.from('simulacoes_3d')
      .select('id, modelo_glb_path, thumbnail_path, ancoras')
      .eq('tenant_id', tenantId).eq('paciente_id', paciente_id)
      .eq('status', 'succeeded').not('modelo_glb_path', 'is', null)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (origem) {
      const { data: nova, error } = await supabaseAdmin.from('simulacoes_3d').insert({
        tenant_id: tenantId, paciente_id, criado_por: req.user!.id,
        status: 'succeeded', creditos_consumidos: 0, ancoras: origem.ancoras,
      }).select().single()
      if (error) { res.status(400).json({ error: error.message }); return }
      const novoGlb = `${tenantId}/${nova.id}/modelo.glb`
      await supabaseAdmin.storage.from(BUCKET).copy(origem.modelo_glb_path!, novoGlb)
      let novoThumb: string | null = null
      if (origem.thumbnail_path) {
        novoThumb = `${tenantId}/${nova.id}/thumbnail.png`
        await supabaseAdmin.storage.from(BUCKET).copy(origem.thumbnail_path, novoThumb)
      }
      const { data: atualizada } = await supabaseAdmin.from('simulacoes_3d')
        .update({ modelo_glb_path: novoGlb, thumbnail_path: novoThumb })
        .eq('id', nova.id).select().single()
      res.status(201).json(atualizada); return
    }
  }

  // Geração nova: exige 2–4 fotos
  const fotos = (req.files as Express.Multer.File[]) ?? []
  if (fotos.length < 2 || fotos.length > 4) {
    res.status(400).json({ error: 'Envie de 2 a 4 fotos (frontal + perfis)' }); return
  }
  if (fotos.some((f) => !TIPOS_FOTO.includes(f.mimetype))) {
    res.status(400).json({ error: 'Formato inválido. Use JPG ou PNG.' }); return
  }

  // Teto de créditos do mês
  const { data: org } = await supabaseAdmin.from('organizacoes')
    .select('studio_3d_limite_creditos_mes').eq('id', tenantId).single()
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const { data: doMes } = await supabaseAdmin.from('simulacoes_3d')
    .select('creditos_consumidos').eq('tenant_id', tenantId)
    .gte('criado_em', inicioMes.toISOString())
  const consumidos = (doMes ?? []).reduce((s, r) => s + (r.creditos_consumidos ?? 0), 0)
  if (consumidos + CREDITOS_POR_GERACAO > (org?.studio_3d_limite_creditos_mes ?? 0)) {
    res.status(422).json({ error: 'Limite mensal de gerações 3D atingido. Fale com o suporte para ampliar.' }); return
  }

  // Cria o registro, sobe as fotos, dispara a Meshy
  const { data: sim, error: insErr } = await supabaseAdmin.from('simulacoes_3d').insert({
    tenant_id: tenantId, paciente_id, criado_por: req.user!.id,
    status: 'pending', creditos_consumidos: CREDITOS_POR_GERACAO,
  }).select().single()
  if (insErr) { res.status(400).json({ error: insErr.message }); return }

  const fotosPaths: string[] = []
  const fotosUrls: string[] = []
  for (let i = 0; i < fotos.length; i++) {
    const ext = fotos[i].mimetype === 'image/png' ? 'png' : 'jpg'
    const path = `${tenantId}/${sim.id}/foto_${i + 1}.${ext}`
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
      .upload(path, fotos[i].buffer, { contentType: fotos[i].mimetype })
    if (upErr) {
      await supabaseAdmin.from('simulacoes_3d').delete().eq('id', sim.id)
      res.status(500).json({ error: `Falha ao salvar foto: ${upErr.message}` }); return
    }
    fotosPaths.push(path)
    fotosUrls.push((await signedUrl(path))!)
  }

  let taskId: string
  try {
    taskId = await criarTask(fotosUrls)
  } catch (e: any) {
    await supabaseAdmin.from('simulacoes_3d')
      .update({ status: 'failed', creditos_consumidos: 0, fotos_paths: fotosPaths }).eq('id', sim.id)
    res.status(502).json({ error: 'Falha ao iniciar a geração 3D. Tente novamente.' }); return
  }

  const { data: final } = await supabaseAdmin.from('simulacoes_3d')
    .update({ meshy_task_id: taskId, fotos_paths: fotosPaths }).eq('id', sim.id).select().single()
  res.status(201).json(final)
})

export default router
