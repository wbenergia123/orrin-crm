// backend/src/routes/imagens-referencia.ts
// Biblioteca de imagens de referência reutilizáveis por clínica
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// Listar imagens de referência da clínica + as globais (tenant_id null, ex: rosto
// masculino padrão — reaproveitadas em todas as clínicas)
router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('imagens_referencia')
    .select('*')
    .or(`tenant_id.is.null,tenant_id.eq.${req.user!.tenant_id}`)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

// Upload de nova imagem de referência (multipart: nome + imagem)
router.post('/upload', (req: Request, res: Response, next) => {
  upload.single('imagem')(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 5MB)' : 'Erro no upload'
      res.status(400).json({ error: msg })
      return
    }
    next()
  })
}, async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo "imagem" é obrigatório' }); return }
  if (!TIPOS_ACEITOS.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    return
  }

  const { nome } = req.body
  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    res.status(400).json({ error: 'nome é obrigatório' })
    return
  }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/ref-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-pacientes')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('fotos-pacientes').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('imagens_referencia')
    .insert({
      tenant_id: req.user!.tenant_id,
      nome: nome.trim(),
      url: publicUrl,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json(data)
})

// Excluir imagem de referência
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('imagens_referencia')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Imagem de referência removida' })
})

export default router
