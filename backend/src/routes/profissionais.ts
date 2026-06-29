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

export default router
