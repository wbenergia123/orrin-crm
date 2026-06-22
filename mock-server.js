// mock-server.js — servidor mock temporário para preview visual
// Roda na porta 3001, retorna dados fake para o frontend do orrin-crm
import express from 'express'
import cors from 'cors'

const app = express()
app.use(express.json())
app.use(cors({ origin: true, credentials: true }))

// Middleware que ignora auth — sempre retorna "autenticado"
app.use((req, _res, next) => {
  req.user = { id: 'mock-user', tenant_id: 'mock-tenant', role: 'admin' }
  next()
})

// ── Pacientes ──
const pacientes = [
  { id: 'p1', telefone: '(11) 99999-1111', nome: 'Maria Silva', email: 'maria@email.com', cpf: null, status: 'cliente', ultimo_contato_at: null, created_at: '2025-01-15T10:00:00Z', updated_at: '2025-06-01T10:00:00Z' },
  { id: 'p2', telefone: '(11) 99999-2222', nome: 'João Santos', email: 'joao@email.com', cpf: null, status: 'consulta_agendada', ultimo_contato_at: null, created_at: '2025-02-20T10:00:00Z', updated_at: '2025-06-10T10:00:00Z' },
  { id: 'p3', telefone: '(11) 99999-3333', nome: 'Ana Costa', email: 'ana@email.com', cpf: null, status: 'em_conversa', ultimo_contato_at: null, created_at: '2025-03-05T10:00:00Z', updated_at: '2025-06-15T10:00:00Z' },
  { id: 'p4', telefone: '(11) 99999-4444', nome: 'Carlos Ferreira', email: 'carlos@email.com', cpf: null, status: 'novo', ultimo_contato_at: null, created_at: '2025-06-18T10:00:00Z', updated_at: '2025-06-18T10:00:00Z' },
]

app.get('/api/pacientes', (_req, res) => res.json(pacientes))
app.get('/api/pacientes/:id', (req, res) => {
  const p = pacientes.find(p => p.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Não encontrado' })
  res.json(p)
})

// ── Agendamentos ──
const agendamentos = [
  { id: 'a1', paciente_id: 'p1', servico_id: 's1', profissional_id: 'pr1', data_hora: '2025-06-25T14:00:00Z', status: 'concluido', notas: 'Ortodontia - retorno', servico: { id: 's1', nome: 'Avaliação', preco: 200 }, profissional: { id: 'pr1', nome: 'Dr. Carlos' } },
  { id: 'a2', paciente_id: 'p1', servico_id: 's2', profissional_id: 'pr1', data_hora: '2025-07-05T10:00:00Z', status: 'agendado', notas: null, servico: { id: 's2', nome: 'Botox', preco: 800 }, profissional: { id: 'pr1', nome: 'Dr. Carlos' } },
  { id: 'a3', paciente_id: 'p2', servico_id: 's1', profissional_id: 'pr2', data_hora: '2025-06-28T16:00:00Z', status: 'confirmado', notas: null, servico: { id: 's1', nome: 'Avaliação', preco: 200 }, profissional: { id: 'pr2', nome: 'Dra. Ana' } },
]

app.get('/api/agendamentos', (req, res) => {
  const pid = req.query.paciente_id
  const filtered = pid ? agendamentos.filter(a => a.paciente_id === pid) : agendamentos
  res.json(filtered)
})

// ── Conversas ──
const conversas = [
  { id: 'c1', paciente_id: 'p1', mensagem_paciente: 'Oi! Quero agendar uma consulta', mensagem_agente: 'Olá! Claro, temos horário na sexta às 14h', tipo_remetente: 'agente', modo_humano: false, created_at: '2025-06-20T14:30:00Z' },
  { id: 'c2', paciente_id: 'p1', mensagem_paciente: 'Perfeito, sexta funciona', mensagem_agente: 'Ótimo! Agendado para sexta às 14h', tipo_remetente: 'agente', modo_humano: false, created_at: '2025-06-20T14:32:00Z' },
  { id: 'c3', paciente_id: 'p1', mensagem_paciente: null, mensagem_agente: 'Lembrete: sua consulta é amanhã às 14h', tipo_remetente: 'agente', modo_humano: false, created_at: '2025-06-24T10:00:00Z' },
]

app.get('/api/atendimentos/:id/conversas', (req, res) => {
  const filtered = conversas.filter(c => c.paciente_id === req.params.id)
  res.json(filtered)
})

// ── Injetáveis ──
const injetaveis = [
  { id: 'i1', tenant_id: 'mock', nome: 'Botox', categoria: 'botox', cor_hex: '#3b82f6', unidade: 'UI', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'i2', tenant_id: 'mock', nome: 'Ácido Hialurônico', categoria: 'filler', cor_hex: '#ec4899', unidade: 'ml', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'i3', tenant_id: 'mock', nome: 'PDO Wires', categoria: 'pdo_wire', cor_hex: '#8b5cf6', unidade: 'un', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'i4', tenant_id: 'mock', nome: 'Bioestimulador', categoria: 'bioestimulador', cor_hex: '#10b981', unidade: 'ml', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'i5', tenant_id: 'mock', nome: 'Bioremodelador', categoria: 'bioremodelador', cor_hex: '#f59e0b', unidade: 'ml', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'i6', tenant_id: 'mock', nome: 'Skinbooster', categoria: 'skinbooster', cor_hex: '#06b6d4', unidade: 'ml', ativo: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
]

app.get('/api/injetaveis', (_req, res) => res.json(injetaveis))
app.post('/api/injetaveis', (req, res) => {
  const novo = { id: `i${Date.now()}`, ...req.body, ativo: true, created_at: new Date().toISOString() }
  injetaveis.push(novo)
  res.status(201).json(novo)
})

// ── Atendimentos (visit_id) ──
const atendimentos = [
  { id: 'v1', tenant_id: 'mock', paciente_id: 'p1', reuniao_id: 'a1', profissional_id: 'pr1', data_atendimento: '2025-06-25T14:00:00Z', status: 'concluido', notas: 'Botox na testa e região periorbicular', created_at: '2025-06-25T14:00:00Z', updated_at: '2025-06-25T14:00:00Z' },
  { id: 'v2', tenant_id: 'mock', paciente_id: 'p1', reuniao_id: null, profissional_id: 'pr1', data_atendimento: '2025-07-05T10:00:00Z', status: 'em_andamento', notas: null, created_at: '2025-07-05T10:00:00Z', updated_at: '2025-07-05T10:00:00Z' },
]

app.get('/api/marcacoes/atendimentos/:paciente_id', (req, res) => {
  const filtered = atendimentos.filter(a => a.paciente_id === req.params.paciente_id)
  res.json(filtered)
})

app.post('/api/marcacoes/atendimentos', (req, res) => {
  const novo = { id: `v${Date.now()}`, ...req.body, status: 'em_andamento', data_atendimento: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  atendimentos.push(novo)
  res.status(201).json(novo)
})

app.patch('/api/marcacoes/atendimentos/:id', (req, res) => {
  const idx = atendimentos.findIndex(a => a.id === req.params.id)
  if (idx >= 0) atendimentos[idx] = { ...atendimentos[idx], ...req.body }
  res.json(atendimentos[idx])
})

// ── Injection Markings ──
const markings = [
  // Sessão v1 (concluída) - face frontal
  { id: 'm1', tenant_id: 'mock', paciente_id: 'p1', visit_id: 'v1', view_type: 'face_front', x: 50, y: 20, product_id: 'i1', quantity: 20, unit: 'UI', lot_id: 'LOT-2025-001', created_by: 'mock-user', created_at: '2025-06-25T14:05:00Z', injetaveis: { nome: 'Botox', cor_hex: '#3b82f6', categoria: 'botox', unidade: 'UI' } },
  { id: 'm2', tenant_id: 'mock', paciente_id: 'p1', visit_id: 'v1', view_type: 'face_front', x: 35, y: 35, product_id: 'i1', quantity: 10, unit: 'UI', lot_id: 'LOT-2025-001', created_by: 'mock-user', created_at: '2025-06-25T14:07:00Z', injetaveis: { nome: 'Botox', cor_hex: '#3b82f6', categoria: 'botox', unidade: 'UI' } },
  { id: 'm3', tenant_id: 'mock', paciente_id: 'p1', visit_id: 'v1', view_type: 'face_front', x: 65, y: 35, product_id: 'i1', quantity: 10, unit: 'UI', lot_id: 'LOT-2025-001', created_by: 'mock-user', created_at: '2025-06-25T14:08:00Z', injetaveis: { nome: 'Botox', cor_hex: '#3b82f6', categoria: 'botox', unidade: 'UI' } },
  { id: 'm4', tenant_id: 'mock', paciente_id: 'p1', visit_id: 'v1', view_type: 'face_front', x: 45, y: 55, product_id: 'i2', quantity: 1.0, unit: 'ml', lot_id: 'LOT-2025-002', created_by: 'mock-user', created_at: '2025-06-25T14:10:00Z', injetaveis: { nome: 'Ácido Hialurônico', cor_hex: '#ec4899', categoria: 'filler', unidade: 'ml' } },
  // Sessão v1 - face perfil esq
  { id: 'm5', tenant_id: 'mock', paciente_id: 'p1', visit_id: 'v1', view_type: 'face_left', x: 30, y: 40, product_id: 'i4', quantity: 2.0, unit: 'ml', lot_id: 'LOT-2025-003', created_by: 'mock-user', created_at: '2025-06-25T14:15:00Z', injetaveis: { nome: 'Bioestimulador', cor_hex: '#10b981', categoria: 'bioestimulador', unidade: 'ml' } },
  // Sessão v2 (em andamento) - vazia por enquanto
]

app.get('/api/marcacoes/:visit_id', (req, res) => {
  let result = markings.filter(m => m.visit_id === req.params.visit_id)
  if (req.query.view_type) result = result.filter(m => m.view_type === req.query.view_type)
  res.json(result)
})

app.get('/api/marcacoes/paciente/:paciente_id', (req, res) => {
  res.json(markings.filter(m => m.paciente_id === req.params.paciente_id))
})

app.post('/api/marcacoes', (req, res) => {
  const { visit_id, paciente_id, view_type, x, y, product_id, quantity, unit, lot_id } = req.body
  const prod = injetaveis.find(p => p.id === product_id)
  const novo = {
    id: `m${Date.now()}`, tenant_id: 'mock', paciente_id, visit_id, view_type, x, y,
    product_id, quantity, unit: unit || 'UI', lot_id: lot_id || null,
    created_by: 'mock-user', created_at: new Date().toISOString(),
    injetaveis: prod ? { nome: prod.nome, cor_hex: prod.cor_hex, categoria: prod.categoria, unidade: prod.unidade } : null,
  }
  markings.push(novo)
  res.status(201).json(novo)
})

app.post('/api/marcacoes/protocolo', (req, res) => {
  const { visit_id, paciente_id, markings: newMarkings } = req.body
  const created = newMarkings.map((m) => {
    const prod = injetaveis.find(p => p.id === m.product_id)
    return {
      id: `m${Date.now()}-${Math.random()}`, tenant_id: 'mock', paciente_id, visit_id,
      ...m, created_by: 'mock-user', created_at: new Date().toISOString(),
      injetaveis: prod ? { nome: prod.nome, cor_hex: prod.cor_hex, categoria: prod.categoria, unidade: prod.unidade } : null,
    }
  })
  markings.push(...created)
  res.status(201).json(created)
})

app.delete('/api/marcacoes/:id', (req, res) => {
  const idx = markings.findIndex(m => m.id === req.params.id)
  if (idx >= 0) markings.splice(idx, 1)
  res.json({ message: 'Marcação removida' })
})

// ── Fotos do paciente ──
const fotos = [
  { id: 'f1', tenant_id: 'mock', paciente_id: 'p1', url: 'https://images.unsplash.com/photo-1559548331-f9cb98001426?w=800', tipo: 'antes', legenda: 'Antes do tratamento - 25/06', created_at: '2025-06-25T13:00:00Z' },
  { id: 'f2', tenant_id: 'mock', paciente_id: 'p1', url: 'https://images.unsplash.com/photo-1614849382065-d6e7d8406c63?w=800', tipo: 'depois', legenda: '30 dias pós-tratamento', created_at: '2025-07-25T13:00:00Z' },
  { id: 'f3', tenant_id: 'mock', paciente_id: 'p1', url: 'https://images.unsplash.com/photo-1620057242255-2f49f5a3d57e?w=800', tipo: 'geral', legenda: 'Foto de perfil', created_at: '2025-06-20T10:00:00Z' },
]

app.get('/api/marcacoes/fotos/:paciente_id', (req, res) => {
  res.json(fotos.filter(f => f.paciente_id === req.params.paciente_id))
})

app.post('/api/marcacoes/fotos', (req, res) => {
  const { paciente_id, url, tipo, legenda } = req.body
  const novo = { id: `f${Date.now()}`, tenant_id: 'mock', paciente_id, url, tipo: tipo || 'geral', legenda: legenda || null, created_at: new Date().toISOString() }
  fotos.push(novo)
  res.status(201).json(novo)
})

app.delete('/api/marcacoes/fotos/:id', (req, res) => {
  const idx = fotos.findIndex(f => f.id === req.params.id)
  if (idx >= 0) fotos.splice(idx, 1)
  res.json({ message: 'Foto removida' })
})

// ── Health ──
app.get('/api/health', (_req, res) => res.json({ status: 'ok', mock: true }))

const PORT = 3001
app.listen(PORT, () => {
  console.log(`🔧 Mock server rodando em http://localhost:${PORT}`)
  console.log(`   Pacientes: ${pacientes.length} | Injetáveis: ${injetaveis.length} | Marcações: ${markings.length} | Fotos: ${fotos.length}`)
})
