import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('profissionais')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('nome')
  if (req.query.ativo === 'true') query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// IMPORTANTE: definir ANTES de router.get('/:id/...') para não conflitar
router.get('/por-servico', async (req, res) => {
  const { servico_id } = req.query
  if (!servico_id) { res.status(400).json({ error: 'servico_id é obrigatório' }); return }

  const { data: vinculos } = await supabaseAdmin
    .from('profissional_servicos')
    .select('profissional_id')
    .eq('servico_id', servico_id as string)
    .eq('tenant_id', req.user!.tenant_id)

  if (!vinculos || vinculos.length === 0) {
    res.json(null)
    return
  }

  res.json(vinculos.map((v) => v.profissional_id))
})

const profissionalSchema = z.object({
  nome: z.string().min(2),
  comissao_percentual: z.number().min(0).max(100).optional(),
})

router.post('/', async (req, res) => {
  const parsed = profissionalSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .insert({ ...parsed.data, tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.patch('/:id', async (req, res) => {
  const schema = z.object({
    nome: z.string().min(2).optional(),
    ativo: z.boolean().optional(),
    comissao_percentual: z.number().min(0).max(100).optional(),
  }).refine((v) => v.nome !== undefined || v.ativo !== undefined || v.comissao_percentual !== undefined, {
    message: 'At least one field is required',
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('profissionais')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(204).send()
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

router.post('/:id/foto', (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 5MB)' : 'Erro no upload'
      res.status(400).json({ error: msg })
      return
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo "foto" é obrigatório' }); return }
  if (!TIPOS_ACEITOS.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    return
  }

  const { data: existente } = await supabaseAdmin
    .from('profissionais')
    .select('id')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (!existente) { res.status(404).json({ error: 'Profissional não encontrado' }); return }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/${req.params.id}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-profissionais')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('fotos-profissionais').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update({ foto_url: publicUrl })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id/foto', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profissionais')
    .update({ foto_url: null })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) { res.status(400).json({ error: error.message }); return }
  res.json(data)
})

// Retorna IDs dos serviços que o profissional realiza
router.get('/:id/servicos', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profissional_servicos')
    .select('servico_id')
    .eq('profissional_id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json((data ?? []).map((r) => r.servico_id))
})

// Substitui todos os serviços do profissional (envia array de UUIDs)
router.put('/:id/servicos', async (req, res) => {
  const schema = z.object({ servico_ids: z.array(z.string().uuid()) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data: prof } = await supabaseAdmin
    .from('profissionais')
    .select('id')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (!prof) { res.status(404).json({ error: 'Profissional não encontrado' }); return }

  await supabaseAdmin
    .from('profissional_servicos')
    .delete()
    .eq('profissional_id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (parsed.data.servico_ids.length > 0) {
    const rows = parsed.data.servico_ids.map((sid) => ({
      profissional_id: req.params.id,
      servico_id: sid,
      tenant_id: req.user!.tenant_id,
    }))
    const { error } = await supabaseAdmin.from('profissional_servicos').insert(rows)
    if (error) { res.status(400).json({ error: error.message }); return }
  }

  res.json({ ok: true })
})

export default router
