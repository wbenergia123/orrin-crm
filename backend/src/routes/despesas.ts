import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../services/supabase'

const router = Router()

// "  ads " → "Ads"
function normalizarCategoria(raw: string): string {
  const t = raw.trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const despesaSchema = z.object({
  descricao: z.string().min(1),
  categoria: z.string().min(1),
  valor: z.number().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fixa: z.boolean().optional(),
  notas: z.string().optional(),
})

router.get('/', async (req: Request, res: Response) => {
  let query = supabaseAdmin
    .from('despesas')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('data', { ascending: false })
  if (req.query.de) query = query.gte('data', req.query.de as string)
  if (req.query.ate) query = query.lte('data', req.query.ate as string)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/categorias', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('despesas')
    .select('categoria')
    .eq('tenant_id', req.user!.tenant_id)
  if (error) return res.status(500).json({ error: error.message })
  res.json([...new Set((data ?? []).map((d) => d.categoria))].sort())
})

router.get('/resumo', async (req: Request, res: Response) => {
  const { de, ate } = req.query
  if (!de || !ate) return res.status(400).json({ error: 'de e ate são obrigatórios (YYYY-MM-DD)' })
  const { data, error } = await supabaseAdmin
    .from('despesas')
    .select('categoria, valor')
    .eq('tenant_id', req.user!.tenant_id)
    .gte('data', de as string)
    .lte('data', ate as string)
  if (error) return res.status(500).json({ error: error.message })
  const porCategoria = new Map<string, number>()
  let total = 0
  for (const d of data ?? []) {
    const v = Number(d.valor)
    total += v
    porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + v)
  }
  res.json({
    total,
    categorias: [...porCategoria.entries()].map(([categoria, t]) => ({ categoria, total: t })).sort((a, b) => b.total - a.total),
  })
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = despesaSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { data, error } = await supabaseAdmin
    .from('despesas')
    .insert({ ...parsed.data, categoria: normalizarCategoria(parsed.data.categoria), tenant_id: req.user!.tenant_id })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Copia despesas fixas do mês anterior ao alvo para o dia 01 do mês alvo.
// Idempotente por descrição: não recopia fixa já existente no mês alvo.
router.post('/copiar-fixas', async (req: Request, res: Response) => {
  const mes = req.body?.mes as string | undefined
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "mes é obrigatório no formato 'YYYY-MM'" })

  const [ano, m] = mes.split('-').map(Number)
  const mesAnt = m === 1 ? 12 : m - 1
  const anoAnt = m === 1 ? ano - 1 : ano
  const pad = (n: number) => String(n).padStart(2, '0')
  const ultimoDia = (a: number, mm: number) => new Date(a, mm, 0).getDate()
  const iniAnt = `${anoAnt}-${pad(mesAnt)}-01`
  const fimAnt = `${anoAnt}-${pad(mesAnt)}-${pad(ultimoDia(anoAnt, mesAnt))}`
  const iniAlvo = `${mes}-01`
  const fimAlvo = `${mes}-${pad(ultimoDia(ano, m))}`

  const tenant = req.user!.tenant_id
  const [{ data: fixasAnt }, { data: jaExistem }] = await Promise.all([
    supabaseAdmin.from('despesas').select('descricao, categoria, valor, notas')
      .eq('tenant_id', tenant).eq('fixa', true).gte('data', iniAnt).lte('data', fimAnt),
    supabaseAdmin.from('despesas').select('descricao')
      .eq('tenant_id', tenant).eq('fixa', true).gte('data', iniAlvo).lte('data', fimAlvo),
  ])

  const existentes = new Set((jaExistem ?? []).map((d) => d.descricao))
  const novas = (fixasAnt ?? [])
    .filter((d) => !existentes.has(d.descricao))
    .map((d) => ({ ...d, fixa: true, data: iniAlvo, tenant_id: tenant }))

  if (novas.length === 0) return res.status(201).json({ copiadas: 0 })
  const { error } = await supabaseAdmin.from('despesas').insert(novas)
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ copiadas: novas.length })
})

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = despesaSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const updates = parsed.data.categoria
    ? { ...parsed.data, categoria: normalizarCategoria(parsed.data.categoria) }
    : parsed.data
  const { data, error } = await supabaseAdmin
    .from('despesas')
    .update(updates)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('despesas')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Despesa removida' })
})

export default router
