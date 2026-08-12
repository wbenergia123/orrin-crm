import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '/Users/willianbatista/orrin-crm/backend/.env' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TENANT_ID = '1dd0beb3-4951-421d-a32a-bc1716dbc5ee' // Floripa Revest

const PAINEIS = 'Painéis WPC'
const FIXACAO = 'Fixação'
const AUTOCOLANTES = 'Autocolantes'

const produtos = [
  { nome: 'Painel Ripado WPC', categoria: PAINEIS, preco: 79.9, descricao: 'Altura de 2,70m, 2,80m ou 2,90m. Largura padrão de 16cm. Preço por painel.' },
  { nome: 'Painel Liso WPC', categoria: PAINEIS, preco: 249.9, descricao: 'Preço por painel.' },
  { nome: 'Canoneira do Ripado', categoria: PAINEIS, preco: 39.9, descricao: 'Acabamento do painel ripado.' },

  { nome: 'Cola PU 40', categoria: FIXACAO, preco: 20.0, descricao: 'Um tubo rende uma placa e meia.' },
  { nome: 'Aplicador de Silicone e Cola PU', categoria: FIXACAO, preco: 20.0 },
  { nome: 'Presilha de Fixação de Painel', categoria: FIXACAO, preco: 1.0, descricao: 'Usada principalmente em forro. Preço por unidade.' },
  { nome: 'Cola Fixa Espelho', categoria: FIXACAO, preco: 34.9 },

  { nome: 'Kit 10 Placas de Mármore Autocolante', categoria: AUTOCOLANTES, preco: 89.9 },
  { nome: 'Papel de Parede Autocolante', categoria: AUTOCOLANTES, preco: 109.9 },
]

async function main() {
  console.log(`Total: ${produtos.length} produtos`)
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(produtos, null, 2))
    return
  }

  // Rodar duas vezes não pode duplicar o catálogo.
  const { data: existentes } = await supabase
    .from('produtos')
    .select('nome')
    .eq('tenant_id', TENANT_ID)
  const jaTem = new Set((existentes ?? []).map((p) => p.nome))

  const novos = produtos.filter((p) => !jaTem.has(p.nome))
  if (novos.length === 0) {
    console.log('Nada a inserir — catálogo já está completo.')
    return
  }

  const rows = novos.map((p) => ({ ...p, tenant_id: TENANT_ID, ativo: true }))
  const { data, error } = await supabase.from('produtos').insert(rows).select('nome, preco')
  if (error) {
    console.error('Erro ao inserir:', error.message)
    process.exit(1)
  }
  for (const p of data) console.log(`  + ${p.nome} — R$ ${Number(p.preco).toFixed(2)}`)
  console.log(`OK — ${data.length} produtos inseridos${jaTem.size ? ` (${jaTem.size} já existiam)` : ''}.`)
}

main()
