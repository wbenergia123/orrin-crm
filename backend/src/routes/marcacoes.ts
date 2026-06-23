// backend/src/routes/marcacoes.ts
// Rotas para Marcação Digital: atendimentos, markings e fotos do paciente
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// ── ATENDIMENTOS (visit_id) ──

// Listar atendimentos do paciente
router.get('/atendimentos/:paciente_id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('atendimentos')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', req.params.paciente_id)
    .order('data_atendimento', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Criar atendimento (nova sessão de marcação)
router.post('/atendimentos', async (req: Request, res: Response) => {
  const { paciente_id, reuniao_id, profissional_id, notas } = req.body
  if (!paciente_id) {
    return res.status(400).json({ error: 'paciente_id é obrigatório' })
  }

  const { data, error } = await supabaseAdmin
    .from('atendimentos')
    .insert({
      paciente_id,
      reuniao_id: reuniao_id || null,
      profissional_id: profissional_id || null,
      notas: notas || null,
      tenant_id: req.user!.tenant_id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// ── INJECTION MARKINGS ──

// Listar marcações de um atendimento (opcionalmente por view_type)
router.get('/:visit_id', async (req: Request, res: Response) => {
  let query = supabaseAdmin
    .from('injection_markings')
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('visit_id', req.params.visit_id)

  if (req.query.view_type) {
    query = query.eq('view_type', req.query.view_type)
  }

  const { data, error } = await query.order('created_at', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Listar todas as marcações de um paciente (para histórico)
router.get('/paciente/:paciente_id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', req.params.paciente_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

// Adicionar marcação
router.post('/', async (req: Request, res: Response) => {
  const { visit_id, paciente_id, view_type, x, y, product_id, quantity, unit, lot_id } = req.body

  if (!visit_id || !paciente_id || !view_type || x == null || y == null || !product_id) {
    return res.status(400).json({ error: 'visit_id, paciente_id, view_type, x, y e product_id são obrigatórios' })
  }

  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .insert({
      visit_id,
      paciente_id,
      view_type,
      x,
      y,
      product_id,
      quantity,
      unit: unit || 'UI',
      lot_id: lot_id || null,
      created_by: req.user!.id,
      tenant_id: req.user!.tenant_id,
    })
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Salvar protocolo completo (batch de marcações)
router.post('/protocolo', async (req: Request, res: Response) => {
  const { visit_id, paciente_id, markings } = req.body

  if (!visit_id || !paciente_id || !Array.isArray(markings)) {
    return res.status(400).json({ error: 'visit_id, paciente_id e markings[] são obrigatórios' })
  }

  const rows = markings.map((m: any) => ({
    visit_id,
    paciente_id,
    view_type: m.view_type,
    x: m.x,
    y: m.y,
    product_id: m.product_id,
    quantity: m.quantity,
    unit: m.unit || 'UI',
    lot_id: m.lot_id || null,
    created_by: req.user!.id,
    tenant_id: req.user!.tenant_id,
  }))

  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .insert(rows)
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Remover marcação
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('injection_markings')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Marcação removida' })
})

// ── FOTOS DO PACIENTE ──

// Listar fotos do paciente
router.get('/fotos/:paciente_id', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('fotos_paciente')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paciente_id', req.params.paciente_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

// Anexar foto (upload real, multipart)
router.post('/fotos/upload', (req: Request, res: Response, next) => {
  upload.single('foto')(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 5MB)' : 'Erro no upload'
      res.status(400).json({ error: msg })
      return
    }
    next()
  })
}, async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo "foto" é obrigatório' }); return }
  if (!TIPOS_ACEITOS.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    return
  }

  const { paciente_id, tipo, legenda, visit_id } = req.body
  if (!paciente_id) { res.status(400).json({ error: 'paciente_id é obrigatório' }); return }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/${paciente_id}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-pacientes')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('fotos-pacientes').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('fotos_paciente')
    .insert({
      paciente_id,
      url: publicUrl,
      tipo: tipo || 'geral',
      legenda: legenda || null,
      visit_id: visit_id || null,
      tenant_id: req.user!.tenant_id,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

// Excluir foto
router.delete('/fotos/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('fotos_paciente')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Foto removida' })
})

export default router
