import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

// ponytail: mock em memória, sem persistência, sem Supabase. Pra visualizar o frontend localmente.

const TOKEN_FAKE = 'mock-token-demo-2026'

// ── Dados em memória ──
const pacientes = [
  { id: 'p1', telefone: '11988887777', nome: 'Maria Silva', email: 'maria@email.com', cpf: '12345678901', status: 'novo', ultimo_contato_at: new Date().toISOString(), created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-01T10:00:00Z' },
  { id: 'p2', telefone: '11977776666', nome: 'João Santos', email: 'joao@email.com', cpf: '98765432109', status: 'em_conversa', ultimo_contato_at: new Date().toISOString(), created_at: '2026-06-02T11:00:00Z', updated_at: '2026-06-02T11:00:00Z' },
  { id: 'p3', telefone: '11966665555', nome: 'Ana Costa', email: 'ana@email.com', cpf: '11122233344', status: 'consulta_agendada', ultimo_contato_at: new Date().toISOString(), created_at: '2026-06-03T09:00:00Z', updated_at: '2026-06-03T09:00:00Z' },
  { id: 'p4', telefone: '11955554444', nome: 'Carlos Oliveira', email: 'carlos@email.com', cpf: '55566677788', status: 'cliente', ultimo_contato_at: new Date().toISOString(), created_at: '2026-05-20T14:00:00Z', updated_at: '2026-05-20T14:00:00Z' },
  { id: 'p5', telefone: '11944443333', nome: 'Beatriz Lima', email: 'bia@email.com', cpf: '99988877766', status: 'frio', ultimo_contato_at: null, created_at: '2026-05-10T08:00:00Z', updated_at: '2026-05-10T08:00:00Z' },
]

const servicos = [
  { id: 's1', nome: 'Limpeza de Pele', preco: 150, duracao_minutos: 60, ativo: true },
  { id: 's2', nome: 'Botox', preco: 800, duracao_minutos: 30, ativo: true },
  { id: 's3', nome: 'Preenchimento', preco: 1200, duracao_minutos: 45, ativo: true },
  { id: 's4', nome: 'Peeling', preco: 250, duracao_minutos: 40, ativo: false },
]

const profissionais = [
  { id: 'pr1', nome: 'Dra. Fernanda Rocha', ativo: true },
  { id: 'pr2', nome: 'Dr. Paulo Mendes', ativo: true },
  { id: 'pr3', nome: 'Dra. Carla Dias', ativo: false },
]

const agora = new Date()
const agendamentos = [
  { id: 'a1', paciente_id: 'p1', servico_id: 's1', profissional_id: 'pr1', data_hora: new Date(agora.getTime() + 86400000).toISOString(), status: 'agendado', notas: 'Primeira consulta', servico: { id: 's1', nome: 'Limpeza de Pele', preco: 150 }, profissional: { id: 'pr1', nome: 'Dra. Fernanda Rocha' }, paciente: { id: 'p1', nome: 'Maria Silva', telefone: '11988887777' } },
  { id: 'a2', paciente_id: 'p3', servico_id: 's2', profissional_id: 'pr2', data_hora: new Date(agora.getTime() + 2*86400000).toISOString(), status: 'confirmado', notas: null, servico: { id: 's2', nome: 'Botox', preco: 800 }, profissional: { id: 'pr2', nome: 'Dr. Paulo Mendes' }, paciente: { id: 'p3', nome: 'Ana Costa', telefone: '11966665555' } },
  { id: 'a3', paciente_id: 'p4', servico_id: 's3', profissional_id: 'pr1', data_hora: new Date(agora.getTime() - 86400000).toISOString(), status: 'concluido', notas: 'Tudo ok', servico: { id: 's3', nome: 'Preenchimento', preco: 1200 }, profissional: { id: 'pr1', nome: 'Dra. Fernanda Rocha' }, paciente: { id: 'p4', nome: 'Carlos Oliveira', telefone: '11955554444' } },
]

const conversas = {
  p1: [
    { id: 'c1', paciente_id: 'p1', mensagem_paciente: 'Oi, quero agendar uma limpeza de pele', mensagem_agente: null, tipo_remetente: 'agente', modo_humano: false, created_at: new Date(agora.getTime() - 3600000).toISOString() },
    { id: 'c2', paciente_id: 'p1', mensagem_paciente: null, mensagem_agente: 'Olá Maria! Temos horário amanhã às 10h, fica bom?', tipo_remetente: 'agente', modo_humano: false, created_at: new Date(agora.getTime() - 3500000).toISOString() },
    { id: 'c3', paciente_id: 'p1', mensagem_paciente: 'Perfeito, pode ser', mensagem_agente: null, tipo_remetente: 'agente', modo_humano: false, created_at: new Date(agora.getTime() - 3400000).toISOString() },
  ],
  p2: [
    { id: 'c4', paciente_id: 'p2', mensagem_paciente: 'Qual o preço do botox?', mensagem_agente: null, tipo_remetente: 'agente', modo_humano: false, created_at: new Date(agora.getTime() - 7200000).toISOString() },
  ],
}

const configuracoes = {
  nome_clinica: 'Clínica Estética Bella',
  endereco_clinica: 'Rua das Flores, 123 - São Paulo',
  telefone_clinica: '(11) 3333-4444',
  horario_clinica: 'Seg-Sex 9h-18h, Sáb 9h-13h',
  prompt_ana: 'Você é a Ana, assistente virtual da clínica. Seja simpática e prestativa.',
}

const modoHumano = { p1: false, p2: false, p3: false, p4: false, p5: false }
const whatsappStatus = { connected: false, qrcode: null }

// ── Middleware de auth (permissivo) ──
app.use((req, res, next) => {
  // ponytail: não valida token de verdade, só passa
  next()
})

// ── Auth ──
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body
  if (email === 'admin@clinica.com' && senha === '123456') {
    res.json({ token: TOKEN_FAKE, usuario: { id: 'u1', email, role: 'admin' } })
  } else {
    res.status(401).json({ error: 'Credenciais inválidas' })
  }
})

// ── Dashboard ──
app.get('/api/dashboard/metricas', (req, res) => {
  res.json({
    faturamentoMes: 28500,
    agendamentosMes: 47,
    leadsNovos: 12,
    taxaConversao: 32,
    deltas: { faturamento: 15, agendamentos: 8, leads: -5 },
  })
})

app.get('/api/dashboard/grafico', (req, res) => {
  const dias = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(agora.getTime() - i * 86400000)
    dias.push({
      data: d.toISOString().split('T')[0],
      agendamentos: Math.floor(Math.random() * 5) + 1,
      mensagens: Math.floor(Math.random() * 10) + 2,
    })
  }
  res.json(dias)
})

app.get('/api/dashboard/status-pacientes', (req, res) => {
  const statusMap = {
    novo: { nome: 'Novo', cor: '#3b82f6' },
    em_conversa: { nome: 'Em Conversa', cor: '#f59e0b' },
    consulta_agendada: { nome: 'Consulta Agendada', cor: '#8b5cf6' },
    cliente: { nome: 'Cliente', cor: '#10b981' },
    frio: { nome: 'Frio', cor: '#9ca3af' },
  }
  const itens = Object.entries(statusMap).map(([status, info]) => {
    const count = pacientes.filter(p => p.status === status).length
    const total = pacientes.length
    return { status, nome: info.nome, count, percentual: Math.round((count / total) * 100), cor: info.cor }
  })
  res.json({ total: pacientes.length, itens })
})

app.get('/api/dashboard/agendamentos-semana', (req, res) => {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  res.json(dias.map((dia, i) => ({ dia, agendamentos: Math.floor(Math.random() * 8) + 1 })))
})

// ── Pacientes ──
app.get('/api/pacientes', (req, res) => {
  let lista = pacientes
  if (req.query.busca) {
    const b = req.query.busca.toLowerCase()
    lista = pacientes.filter(p => p.nome?.toLowerCase().includes(b) || p.telefone.includes(b))
  }
  // paginacao simples
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  const start = (page - 1) * limit
  res.json({ data: lista.slice(start, start + limit), total: lista.length, page, limit })
})

app.get('/api/pacientes/:id', (req, res) => {
  const p = pacientes.find(p => p.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Não encontrado' })
  res.json(p)
})

app.patch('/api/pacientes/:id/status', (req, res) => {
  const p = pacientes.find(p => p.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Não encontrado' })
  p.status = req.body.status
  p.updated_at = new Date().toISOString()
  res.json(p)
})

// ── Serviços ──
app.get('/api/servicos', (req, res) => {
  res.json(servicos.filter(s => req.query.ato === 'true' ? s.ativo : true))
})

app.post('/api/servicos', (req, res) => {
  const { nome, preco, duracao_minutos } = req.body
  const novo = { id: 's' + (servicos.length + 1), nome, preco: Number(preco), duracao_minutos: Number(duracao_minutos), ativo: true }
  servicos.push(novo)
  res.json(novo)
})

app.patch('/api/servicos/:id', (req, res) => {
  const s = servicos.find(s => s.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'Não encontrado' })
  Object.assign(s, req.body)
  res.json(s)
})

app.delete('/api/servicos/:id', (req, res) => {
  const idx = servicos.findIndex(s => s.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' })
  servicos[idx].ativo = false
  res.json({ ok: true })
})

// ── Profissionais ──
app.get('/api/profissionais', (req, res) => {
  let lista = profissionais
  if (req.query.ativo === 'true') lista = profissionais.filter(p => p.ativo)
  res.json(lista)
})

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body
  const novo = { id: 'pr' + (profissionais.length + 1), nome, ativo: true }
  profissionais.push(novo)
  res.json(novo)
})

app.patch('/api/profissionais/:id', (req, res) => {
  const p = profissionais.find(p => p.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Não encontrado' })
  Object.assign(p, req.body)
  res.json(p)
})

// ── Agendamentos ──
app.get('/api/agendamentos', (req, res) => {
  let lista = agendamentos
  if (req.query.paciente_id) lista = agendamentos.filter(a => a.paciente_id === req.query.paciente_id)
  res.json(lista)
})

app.get('/api/agendamentos/:id', (req, res) => {
  const a = agendamentos.find(a => a.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'Não encontrado' })
  res.json(a)
})

app.get('/api/agendamentos/slots-disponiveis', (req, res) => {
  // ponytail: gera slots fake pro dia todo
  const slots = []
  for (let h = 9; h <= 17; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`)
    slots.push(`${h.toString().padStart(2, '0')}:30`)
  }
  res.json(slots)
})

app.post('/api/agendamentos', (req, res) => {
  const { paciente_id, servico_id, profissional_id, data_hora, notas } = req.body
  const novo = {
    id: 'a' + (agendamentos.length + 1),
    paciente_id, servico_id, profissional_id, data_hora,
    status: 'agendado', notas: notas || null,
    servico: servicos.find(s => s.id === servico_id),
    profissional: profissionais.find(p => p.id === profissional_id),
    paciente: pacientes.find(p => p.id === paciente_id),
  }
  agendamentos.push(novo)
  res.json(novo)
})

app.patch('/api/agendamentos/:id', (req, res) => {
  const a = agendamentos.find(a => a.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'Não encontrado' })
  Object.assign(a, req.body)
  res.json(a)
})

// ── Atendimentos ──
app.get('/api/atendimentos', (req, res) => {
  if (req.query.paciente_id) {
    const p = pacientes.find(p => p.id === req.query.paciente_id)
    return res.json([{ ...p, modo_humano: modoHumano[p.id] || false, ultima_mensagem: 'Oi', nao_lidas: 0 }])
  }
  // lista resumida
  res.json(pacientes.map(p => ({
    ...p,
    modo_humano: modoHumano[p.id] || false,
    ultima_mensagem: (conversas[p.id] || []).slice(-1)[0]?.mensagem_paciente || 'Sem mensagens',
    nao_lidas: 0,
  })))
})

app.get('/api/atendimentos/resumo', (req, res) => {
  res.json({
    total: pacientes.length,
    em_atendimento: Object.values(modoHumano).filter(Boolean).length,
    aguardando: pacientes.filter(p => !modoHumano[p.id]).length,
  })
})

app.get('/api/atendimentos/:id/conversas', (req, res) => {
  res.json(conversas[req.params.id] || [])
})

app.patch('/api/atendimentos/:id/handoff', (req, res) => {
  modoHumano[req.params.id] = req.body.modo_humano
  res.json({ ok: true })
})

app.post('/api/atendimentos/:id/mensagem', (req, res) => {
  const { texto } = req.body
  const nova = {
    id: 'c' + Date.now(),
    paciente_id: req.params.id,
    mensagem_paciente: null,
    mensagem_agente: texto,
    tipo_remetente: 'humano',
    modo_humano: true,
    created_at: new Date().toISOString(),
  }
  if (!conversas[req.params.id]) conversas[req.params.id] = []
  conversas[req.params.id].push(nova)
  res.json(nova)
})

// ── Configurações ──
app.get('/api/configuracoes', (req, res) => res.json(configuracoes))

app.patch('/api/configuracoes/:chave', (req, res) => {
  configuracoes[req.params.chave] = req.body.valor
  res.json({ ok: true })
})

// ── WhatsApp ──
app.get('/api/whatsapp/status', (req, res) => res.json(whatsappStatus))

app.post('/api/whatsapp/connect', (req, res) => {
  whatsappStatus.connected = true
  whatsappStatus.qrcode = null
  res.json({ connected: true })
})

app.post('/api/whatsapp/disconnect', (req, res) => {
  whatsappStatus.connected = false
  res.json({ connected: false })
})

app.get('/api/whatsapp/contact-photo', (req, res) => {
  res.json({ photo: null })
})

// ── Inicia ──
const PORT = 3001
app.listen(PORT, () => {
  console.log(`\n Mock server rodando em http://localhost:${PORT}`)
  console.log(` Login: admin@clinica.com / 123456\n`)
})
