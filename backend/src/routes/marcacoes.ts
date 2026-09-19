// backend/src/routes/marcacoes.ts
// Rotas para Marcação Digital: atendimentos, markings e fotos do paciente
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'
import { assinarFoto, removerFoto } from '../lib/storage-fotos'

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

// Atualizar atendimento (concluir sessão, corrigir a data ou trocar o fundo)
router.patch('/atendimentos/:id', async (req: Request, res: Response) => {
  const { status, data_atendimento, background_modo, background_foto_id, background_imagem_id, background_opacidade } = req.body

  if (data_atendimento) {
    const hojeBRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    if (data_atendimento.slice(0, 10) > hojeBRT) {
      return res.status(400).json({ error: 'Data não pode ser no futuro' })
    }
  }

  const updates: Record<string, unknown> = {}
  if (status) updates.status = status
  if (data_atendimento) updates.data_atendimento = data_atendimento

  if (background_modo !== undefined) {
    if (!['anatomico', 'foto_paciente', 'imagem_referencia'].includes(background_modo)) {
      return res.status(400).json({ error: 'background_modo inválido' })
    }
    updates.background_modo = background_modo
  }
  if (background_foto_id !== undefined) updates.background_foto_id = background_foto_id || null
  if (background_imagem_id !== undefined) updates.background_imagem_id = background_imagem_id || null
  if (background_opacidade !== undefined) {
    const op = Number(background_opacidade)
    if (Number.isNaN(op) || op < 10 || op > 100) {
      return res.status(400).json({ error: 'background_opacidade deve estar entre 10 e 100' })
    }
    updates.background_opacidade = op
  }

  const { data, error } = await supabaseAdmin
    .from('atendimentos')
    .update(updates)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error || !data) return res.status(404).json({ error: 'Atendimento não encontrado' })
  res.json(data)
})

// Excluir um protocolo (sessão) inteiro — apaga as marcações, desvincula as
// fotos (preservadas, só deixam de pertencer a essa sessão) e remove a sessão.
router.delete('/atendimentos/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const tenantId = req.user!.tenant_id

  await supabaseAdmin.from('injection_markings').delete().eq('visit_id', id).eq('tenant_id', tenantId)
  await supabaseAdmin.from('fotos_paciente').update({ visit_id: null }).eq('visit_id', id).eq('tenant_id', tenantId)

  const { error } = await supabaseAdmin
    .from('atendimentos')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Protocolo excluído' })
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
  const { visit_id, paciente_id, view_type, x, y, product_id, quantity, unit, lot_id, tipo_desenho, pontos } = req.body

  if (!visit_id || !paciente_id || !view_type || !product_id) {
    return res.status(400).json({ error: 'visit_id, paciente_id, view_type e product_id são obrigatórios' })
  }

  const tipo = tipo_desenho || 'ponto'
  if (!['ponto', 'linha', 'forma'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo_desenho deve ser ponto, linha ou forma' })
  }

  let finalX = x ?? 0
  let finalY = y ?? 0
  let finalPontos = pontos ?? null

  if (tipo === 'ponto') {
    if (x == null || y == null) {
      return res.status(400).json({ error: 'x e y são obrigatórios para tipo_desenho=ponto' })
    }
  } else if (tipo === 'linha') {
    if (!Array.isArray(pontos) || pontos.length < 2) {
      return res.status(400).json({ error: 'pontos deve ter pelo menos 2 itens para tipo_desenho=linha' })
    }
    finalX = pontos[0].x
    finalY = pontos[0].y
  } else if (tipo === 'forma') {
    if (!Array.isArray(pontos) || pontos.length < 3) {
      return res.status(400).json({ error: 'pontos deve ter pelo menos 3 itens para tipo_desenho=forma' })
    }
    finalX = pontos[0].x
    finalY = pontos[0].y
  }

  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .insert({
      visit_id,
      paciente_id,
      view_type,
      x: finalX,
      y: finalY,
      tipo_desenho: tipo,
      pontos: finalPontos,
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

  const rows = markings.map((m: any) => {
    const tipo = m.tipo_desenho || 'ponto'
    let finalX = m.x ?? 0
    let finalY = m.y ?? 0
    let finalPontos = m.pontos ?? null

    if (tipo === 'linha' && Array.isArray(m.pontos) && m.pontos.length >= 2) {
      finalX = m.pontos[0].x
      finalY = m.pontos[0].y
    } else if (tipo === 'forma' && Array.isArray(m.pontos) && m.pontos.length >= 3) {
      finalX = m.pontos[0].x
      finalY = m.pontos[0].y
    }

    return {
      visit_id,
      paciente_id,
      view_type: m.view_type,
      x: finalX,
      y: finalY,
      tipo_desenho: tipo,
      pontos: finalPontos,
      product_id: m.product_id,
      quantity: m.quantity,
      unit: m.unit || 'UI',
      lot_id: m.lot_id || null,
      created_by: req.user!.id,
      tenant_id: req.user!.tenant_id,
    }
  })

  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .insert(rows)
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Mover marcação do tipo ponto (arrastar pra outra posição sem precisar excluir)
router.patch('/:id', async (req: Request, res: Response) => {
  const { x, y } = req.body
  if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100) {
    return res.status(400).json({ error: 'x e y devem ser números entre 0 e 100' })
  }

  const { data, error } = await supabaseAdmin
    .from('injection_markings')
    .update({ x, y })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .eq('tipo_desenho', 'ponto')
    .select('*, injetaveis(nome, cor_hex, categoria, unidade)')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
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
  const comUrls = await Promise.all((data ?? []).map(async (f) => ({ ...f, url: await assinarFoto(f.url) })))
  res.json(comUrls)
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

  // o paciente tem que ser desta clínica (senão dá pra anexar foto no paciente de outra)
  const { data: dono } = await supabaseAdmin
    .from('pacientes').select('id').eq('id', paciente_id).eq('tenant_id', req.user!.tenant_id).maybeSingle()
  if (!dono) { res.status(404).json({ error: 'Paciente não encontrado' }); return }

  const ext = req.file.mimetype.split('/')[1]
  const path = `${req.user!.tenant_id}/${paciente_id}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('fotos-pacientes')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype })
  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const { data, error } = await supabaseAdmin
    .from('fotos_paciente')
    .insert({
      paciente_id,
      url: path, // guarda o caminho; a leitura assina
      tipo: tipo || 'geral',
      legenda: legenda || null,
      visit_id: visit_id || null,
      tenant_id: req.user!.tenant_id,
    })
    .select()
    .single()

  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(201).json({ ...data, url: await assinarFoto(data.url) })
})

// Anotações livres editáveis (traços + rótulos), coordenadas normalizadas 0–1 na imagem
const coord = z.number().min(0).max(1)
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const anotacoesSchema = z.object({
  tracos: z.array(z.object({
    cor,
    largura: z.number().positive().max(0.2),
    pontos: z.array(z.tuple([coord, coord])).min(1).max(5000),
  })).max(500),
  rotulos: z.array(z.object({
    texto: z.string().trim().min(1).max(60),
    cor,
    x: coord,
    y: coord,
  })).max(100),
})
const fotoPatchSchema = z.object({
  anotacoes: anotacoesSchema.nullable().optional(),
  legenda: z.string().max(255).nullable().optional(),
  tipo: z.enum(['antes', 'depois', 'geral']).optional(),
}).refine(b => Object.keys(b).length > 0, 'Nada para atualizar')

// Atualizar foto (anotações, legenda, tipo) — a imagem em si não muda
router.patch('/fotos/:id', async (req: Request, res: Response) => {
  const parsed = fotoPatchSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabaseAdmin
    .from('fotos_paciente')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .maybeSingle()
  if (error) { res.status(400).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: 'Foto não encontrada' }); return }
  res.json(data)
})

// Excluir foto (apaga também o arquivo do bucket)
router.delete('/fotos/:id', async (req: Request, res: Response) => {
  const { data: foto } = await supabaseAdmin
    .from('fotos_paciente').select('url').eq('id', req.params.id).eq('tenant_id', req.user!.tenant_id).maybeSingle()
  const { error } = await supabaseAdmin
    .from('fotos_paciente')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)

  if (error) return res.status(400).json({ error: error.message })
  if (foto) await removerFoto(foto.url)
  res.json({ message: 'Foto removida' })
})

export default router
