/**
 * Seed de dados para demo — Clínica Estética
 * Cria: profissionais, serviços, 10 pacientes com histórico realista
 *
 * Uso: node scripts/seed-demo.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const ago = (days, hours = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

const future = (days, hours = 10) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

async function seed() {
  console.log('🌱 Iniciando seed de demo...\n')

  // ── 1. Profissionais ──────────────────────────────────────────
  console.log('👩‍⚕️  Criando profissionais...')
  const { data: profs } = await supabase
    .from('profissionais')
    .upsert([
      { nome: 'Dra. Ana Costa' },
      { nome: 'Dra. Maria Silva' },
    ], { onConflict: 'nome', ignoreDuplicates: false })
    .select()

  // Fallback: busca se já existem
  const { data: todosProfs } = await supabase
    .from('profissionais')
    .select('id, nome')
    .eq('ativo', true)
    .limit(2)

  const [profAna, profMaria] = todosProfs
  console.log(`   ✓ ${profAna.nome} (${profAna.id.slice(0, 8)}...)`)
  console.log(`   ✓ ${profMaria.nome} (${profMaria.id.slice(0, 8)}...)`)

  // ── 2. Serviços ───────────────────────────────────────────────
  console.log('\n💅 Criando serviços...')
  const servicosData = [
    { nome: 'Botox',              preco: 800.00,  duracao_minutos: 45 },
    { nome: 'Preenchimento Labial', preco: 1200.00, duracao_minutos: 60 },
    { nome: 'Limpeza de Pele',    preco: 250.00,  duracao_minutos: 60 },
    { nome: 'Peeling Químico',    preco: 350.00,  duracao_minutos: 60 },
    { nome: 'Microagulhamento',   preco: 450.00,  duracao_minutos: 75 },
    { nome: 'Fios de PDO',        preco: 1500.00, duracao_minutos: 90 },
  ]

  const { data: servicos } = await supabase
    .from('servicos')
    .upsert(servicosData, { onConflict: 'nome', ignoreDuplicates: false })
    .select()

  const { data: todosServicos } = await supabase
    .from('servicos')
    .select('id, nome, preco')
    .eq('ativo', true)

  for (const s of todosServicos) console.log(`   ✓ ${s.nome} — R$ ${s.preco}`)

  const svcByNome = Object.fromEntries(todosServicos.map(s => [s.nome, s]))

  // ── 3. Pacientes + histórico ──────────────────────────────────
  console.log('\n👥 Criando pacientes com histórico...')

  const pacientesConfig = [
    {
      telefone: '5511991110001',
      nome: 'Camila Ferreira',
      status: 'cliente',
      conversas: [
        { msg: 'Olá! Gostaria de agendar um botox', resp: 'Olá Camila! Claro, temos disponibilidade. Qual seria o melhor horário para você?' },
        { msg: 'Pode ser quarta às 10h?', resp: 'Perfeito! Quarta-feira às 10h com a Dra. Ana Costa para Botox. Confirmo o agendamento para você!' },
        { msg: 'Ótimo, obrigada!', resp: 'Às ordens! Te aguardamos na quarta 😊' },
      ],
      agendamentos: [
        { dias: -60, serv: 'Botox', prof: profAna, status: 'concluido', notas: null },
        { dias: -25, serv: 'Limpeza de Pele', prof: profMaria, status: 'concluido', notas: null },
        { dias: 7,   serv: 'Botox', prof: profAna, status: 'confirmado', notas: 'Retorno semestral' },
      ],
    },
    {
      telefone: '5511992220002',
      nome: 'Juliana Mendes',
      status: 'cliente',
      conversas: [
        { msg: 'Boa tarde! Quero informações sobre preenchimento labial', resp: 'Boa tarde, Juliana! O preenchimento labial é feito com ácido hialurônico. O valor é R$ 1.200 e a sessão dura cerca de 1 hora. Posso agendar uma avaliação?' },
        { msg: 'Sim, por favor! Qual o dia disponível?', resp: 'Temos disponibilidade na terça às 14h ou quinta às 16h. Qual prefere?' },
        { msg: 'Terça perfeito!', resp: 'Agendado para terça-feira! Te envio a confirmação 😊' },
      ],
      agendamentos: [
        { dias: -45, serv: 'Preenchimento Labial', prof: profAna, status: 'concluido', notas: null },
        { dias: -10, serv: 'Botox', prof: profAna, status: 'concluido', notas: null },
        { dias: 14,  serv: 'Preenchimento Labial', prof: profAna, status: 'agendado', notas: 'Segunda aplicação' },
      ],
    },
    {
      telefone: '5511993330003',
      nome: 'Fernanda Oliveira',
      status: 'cliente',
      conversas: [
        { msg: 'Oi, quero fazer peeling', resp: 'Oi Fernanda! O peeling químico renova a pele e trata manchas. Temos disponibilidade para você!' },
        { msg: 'Pode ser semana que vem?', resp: 'Claro! Tenho abertura na segunda às 9h com a Dra. Maria Silva. Confirmo?' },
        { msg: 'Sim confirma', resp: 'Pronto! Segunda às 9h com a Dra. Maria Silva para Peeling Químico ✅' },
      ],
      agendamentos: [
        { dias: -90, serv: 'Peeling Químico', prof: profMaria, status: 'concluido', notas: null },
        { dias: -55, serv: 'Microagulhamento', prof: profMaria, status: 'concluido', notas: null },
        { dias: -20, serv: 'Peeling Químico', prof: profMaria, status: 'concluido', notas: null },
        { dias: 3,   serv: 'Microagulhamento', prof: profMaria, status: 'confirmado', notas: '3ª sessão do protocolo' },
      ],
    },
    {
      telefone: '5511994440004',
      nome: 'Beatriz Santos',
      status: 'consulta_agendada',
      conversas: [
        { msg: 'Olá! Queria saber sobre fios de PDO', resp: 'Oi Beatriz! Os fios de PDO fazem o lifting facial sem cirurgia. A Dra. Ana Costa é especialista nisso. Quer agendar uma avaliação?' },
        { msg: 'Sim! Qual o preço?', resp: 'A aplicação de Fios de PDO é R$ 1.500. Posso confirmar sua avaliação para a próxima semana?' },
        { msg: 'Pode ser na quinta', resp: 'Agendado para quinta-feira! Te esperamos 🌟' },
      ],
      agendamentos: [
        { dias: 5, serv: 'Fios de PDO', prof: profAna, status: 'agendado', notas: 'Primeira vez — avaliação prévia feita por telefone' },
      ],
    },
    {
      telefone: '5511995550005',
      nome: 'Mariana Costa',
      status: 'em_conversa',
      conversas: [
        { msg: 'Boa noite! Tenho manchas no rosto, o que vocês indicam?', resp: 'Boa noite, Mariana! Para manchas, temos ótimos resultados com Peeling Químico e Microagulhamento. Posso agendar uma avaliação gratuita com a Dra. Maria Silva?' },
        { msg: 'Que horas vocês atendem?', resp: 'Atendemos de segunda a sexta das 8h às 19h, e sábado das 8h às 14h. Tem algum dia de preferência?' },
      ],
      agendamentos: [],
    },
    {
      telefone: '5511996660006',
      nome: 'Patrícia Lima',
      status: 'cliente',
      conversas: [
        { msg: 'Oi, preciso remarcar minha consulta de limpeza de pele', resp: 'Oi Patrícia! Claro, sem problema. Para qual data você prefere remarcar?' },
        { msg: 'Pode ser sexta às 11h?', resp: 'Perfeito! Remarcado para sexta-feira às 11h com a Dra. Maria Silva ✅' },
      ],
      agendamentos: [
        { dias: -120, serv: 'Limpeza de Pele', prof: profMaria, status: 'concluido', notas: null },
        { dias: -75,  serv: 'Peeling Químico', prof: profMaria, status: 'concluido', notas: null },
        { dias: -30,  serv: 'Limpeza de Pele', prof: profMaria, status: 'concluido', notas: null },
        { dias: 10,   serv: 'Limpeza de Pele', prof: profMaria, status: 'confirmado', notas: null },
      ],
    },
    {
      telefone: '5511997770007',
      nome: 'Renata Alves',
      status: 'novo',
      conversas: [
        { msg: 'Olá, vocês fazem botox preventivo?', resp: 'Olá Renata! Sim, fazemos! O botox preventivo é muito indicado para quem quer adiar o aparecimento de rugas. Quer que eu agende uma avaliação?' },
      ],
      agendamentos: [],
    },
    {
      telefone: '5511998880008',
      nome: 'Larissa Rodrigues',
      status: 'cliente',
      conversas: [
        { msg: 'Gostaria de agendar microagulhamento', resp: 'Olá Larissa! O microagulhamento estimula o colágeno e melhora textura e poros. Posso agendar com a Dra. Ana ou Maria, qual prefere?' },
        { msg: 'Dra Ana, por favor', resp: 'Anotado! Dra. Ana Costa, microagulhamento. Tenho quinta às 15h disponível, pode ser?' },
        { msg: 'Pode!', resp: 'Confirmado para quinta às 15h! 🎉' },
      ],
      agendamentos: [
        { dias: -50, serv: 'Microagulhamento', prof: profAna, status: 'concluido', notas: null },
        { dias: -15, serv: 'Microagulhamento', prof: profAna, status: 'concluido', notas: null },
        { dias: 12,  serv: 'Microagulhamento', prof: profAna, status: 'agendado',  notas: '3ª sessão — protocolo anti-aging' },
      ],
    },
    {
      telefone: '5511999990009',
      nome: 'Daniela Souza',
      status: 'frio',
      conversas: [
        { msg: 'Olá, quanto custa botox?', resp: 'Olá! O botox na nossa clínica é R$ 800. Inclui avaliação prévia com a médica. Quer agendar?' },
        { msg: 'Vou pensar, obrigada', resp: 'Claro, sem pressão! Quando quiser, é só chamar 😊 Você tem alguma dúvida?' },
      ],
      agendamentos: [],
    },
    {
      telefone: '5511900000010',
      nome: 'Amanda Pereira',
      status: 'consulta_agendada',
      conversas: [
        { msg: 'Oi! Vi vocês no instagram, adorei o trabalho', resp: 'Que ótimo, Amanda! Ficamos felizes 💜 Posso te ajudar com algum procedimento?' },
        { msg: 'Quero fazer botox e preenchimento', resp: 'Ótima combinação! Podemos fazer os dois no mesmo dia. Qual seria o melhor horário para você?' },
        { msg: 'Semana que vem, de manhã', resp: 'Perfeito! Tenho segunda às 9h com a Dra. Ana Costa para os dois procedimentos. Confirmo?' },
        { msg: 'Pode confirmar', resp: 'Confirmado! Segunda-feira às 9h — Botox + Preenchimento Labial com a Dra. Ana Costa ✅ Te aguardamos!' },
      ],
      agendamentos: [
        { dias: 2, serv: 'Botox', prof: profAna, status: 'agendado', notas: 'Primeira vez. Quer botox + preenchimento na mesma sessão.' },
      ],
    },
  ]

  for (const p of pacientesConfig) {
    // Upsert paciente
    const { data: pac } = await supabase
      .from('pacientes')
      .upsert({
        telefone: p.telefone,
        nome: p.nome,
        status: p.status,
        ultimo_contato_at: new Date().toISOString(),
      }, { onConflict: 'telefone' })
      .select('id')
      .single()

    const pacId = pac.id

    // Conversas
    for (let i = 0; i < p.conversas.length; i++) {
      const c = p.conversas[i]
      const daysAgo = p.agendamentos.length > 0
        ? (p.agendamentos[0].dias < 0 ? Math.abs(p.agendamentos[0].dias) + (p.conversas.length - i) : i + 1)
        : i + 1
      const ts = ago(daysAgo + p.conversas.length - i, 9 + i)

      await supabase.from('conversas').insert({
        paciente_id: pacId,
        mensagem_paciente: c.msg,
        mensagem_agente: null,
        tipo_remetente: 'agente',
        modo_humano: false,
        created_at: ts,
      })
      await supabase.from('conversas').insert({
        paciente_id: pacId,
        mensagem_paciente: null,
        mensagem_agente: c.resp,
        tipo_remetente: 'agente',
        modo_humano: false,
        created_at: new Date(new Date(ts).getTime() + 2 * 60 * 1000).toISOString(),
      })
    }

    // Agendamentos
    for (const ag of p.agendamentos) {
      const serv = svcByNome[ag.serv]
      if (!serv) { console.warn(`   ⚠ Serviço não encontrado: ${ag.serv}`); continue }

      const hora = 9 + Math.floor(Math.random() * 5)
      const dataHora = ag.dias < 0 ? ago(Math.abs(ag.dias), hora) : future(ag.dias, hora)

      await supabase.from('agendamentos').insert({
        paciente_id: pacId,
        servico_id: serv.id,
        profissional_id: ag.prof.id,
        data_hora: dataHora,
        status: ag.status,
        notas: ag.notas,
      })
    }

    const totalAg = p.agendamentos.length
    const totalConv = p.conversas.length
    console.log(`   ✓ ${p.nome} — ${totalAg} agendamento(s), ${totalConv * 2} mensagem(ns)`)
  }

  console.log('\n✅ Seed completo!')
  console.log('   Acesse http://localhost:5173 para ver os dados.')
}

seed().catch((e) => { console.error('❌ Erro:', e.message); process.exit(1) })
