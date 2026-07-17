import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '/Users/willianbatista/orrin-crm/backend/.env' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TENANT_ID = '2ee1cb45-5423-447a-ac47-d8a3dcfade18' // Agrokhan

const CONJUNTO_FRONTAL = 'Conjunto Frontal'
const ACESSORIOS = 'Acessórios'

const produtos = [
  // Conjunto Frontal
  { nome: 'Conjunto PAK 1000kg (50 a 100cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$23.700,00 com adaptador incluso. Adaptador individual: R$8.000,00.' },
  { nome: 'Conjunto PAK 1200kg (75 a 110cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$29.160,00 com adaptador incluso.' },
  { nome: 'Conjunto PAK 1600kg (75 a 130cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$30.000,00 com adaptador incluso.' },
  { nome: 'Conjunto PAK 1900kg (120 a 160cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$35.600,00 com adaptador incluso. Adaptador individual: R$10.000,00.' },
  { nome: 'Conjunto ANAK 1200kg (75 a 110cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$29.160,00 com adaptador incluso. Adaptador individual: R$10.000,00.' },
  { nome: 'Conjunto ANAK 1600kg (75 a 120cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$34.500,00 com adaptador incluso.' },
  { nome: 'Conjunto ANAK 1800kg (100 a 130cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$41.000,00 com adaptador incluso.' },
  { nome: 'Conjunto ANAK 2000kg (120 a 160cv)', categoria: CONJUNTO_FRONTAL, descricao: 'R$46.400,00 com adaptador incluso. Adaptador individual: R$12.000,00.' },

  // Carreta para transportar plantadeira
  { nome: 'Carreta para Transportar Plantadeira 6m', categoria: ACESSORIOS, descricao: 'R$75.000,00' },
  { nome: 'Carreta para Transportar Plantadeira 8m', categoria: ACESSORIOS, descricao: 'R$95.000,00' },
  { nome: 'Carreta para Transportar Plantadeira 10m', categoria: ACESSORIOS, descricao: 'R$118.000,00' },
  { nome: 'Carreta para Transportar Plantadeira 12m', categoria: ACESSORIOS, descricao: 'R$138.000,00' },
  { nome: 'Carreta para Transportar Plantadeira 15m', categoria: ACESSORIOS, descricao: 'R$169.000,00' },

  // Acessórios avulsos
  { nome: 'Rachador de Lenha', categoria: ACESSORIOS, descricao: 'R$12.800,00' },
  { nome: 'Concha Hidráulica Traseira', categoria: ACESSORIOS, descricao: 'R$7.600,00' },
  { nome: 'Perfurador de Solo', categoria: ACESSORIOS, descricao: 'R$8.400,00' },
  { nome: 'Picador de Feno', categoria: ACESSORIOS, descricao: 'R$12.980,00' },
  { nome: 'Carreta Caçamba Agrícola 6T', categoria: ACESSORIOS, descricao: 'R$27.700,00' },
  { nome: 'Carreta Caçamba Agrícola 9T', categoria: ACESSORIOS, descricao: 'R$36.600,00' },
  { nome: 'Guincho Bag Traseiro', categoria: ACESSORIOS, descricao: 'R$32.000,00' },
  { nome: 'Batedor de Cama', categoria: ACESSORIOS, descricao: 'R$14.500,00' },
  { nome: 'Rastelo Motorizado', categoria: ACESSORIOS, descricao: 'R$4.800,00' },
  { nome: 'Joystick', categoria: ACESSORIOS, descricao: 'R$8.480,00' },
  { nome: 'Multifaster', categoria: ACESSORIOS, descricao: 'Preço sob consulta.' },
  { nome: 'Concha Padrão', categoria: ACESSORIOS, descricao: 'R$6.400,00' },
  { nome: 'Concha Grande', categoria: ACESSORIOS, descricao: 'R$9.560,00' },
  { nome: 'Lâmina Padrão', categoria: ACESSORIOS, descricao: 'R$6.650,00' },
  { nome: 'Lâmina Grande', categoria: ACESSORIOS, descricao: 'R$10.670,00' },
  { nome: 'Paleteira Padrão', categoria: ACESSORIOS, descricao: 'R$6.270,00' },
  { nome: 'Paleteira Grande', categoria: ACESSORIOS, descricao: 'R$9.430,00' },
  { nome: 'Garfo para Silagem', categoria: ACESSORIOS, descricao: 'R$12.000,00 (versão grande).' },
  { nome: 'Guincho Frontal Big Bag Padrão', categoria: ACESSORIOS, descricao: 'R$5.100,00' },
  { nome: 'Guincho Frontal Big Bag Grande', categoria: ACESSORIOS, descricao: 'R$8.340,00' },
  { nome: 'Pneu Aro 10 Agrícola', categoria: ACESSORIOS, descricao: 'Cotação diária.' },
  { nome: 'Pneu Aro 16 Agrícola', categoria: ACESSORIOS, descricao: 'Cotação diária.' },
  { nome: 'Roda Aro 10 Agrícola', categoria: ACESSORIOS, descricao: 'Cotação diária.' },
  { nome: 'Roda Aro 16 Agrícola', categoria: ACESSORIOS, descricao: 'Cotação diária.' },

  // Carretinha p/ Plataforma
  { nome: 'Carretinha p/ Plataforma 20 pés (1 eixo)', categoria: ACESSORIOS, descricao: 'R$21.900,00' },
  { nome: 'Carretinha p/ Plataforma 25 pés (1 eixo)', categoria: ACESSORIOS, descricao: 'R$23.900,00' },
  { nome: 'Carretinha p/ Plataforma 25 pés (2 eixos, 6 pneus)', categoria: ACESSORIOS, descricao: 'R$29.900,00' },
  { nome: 'Carretinha p/ Plataforma 30 pés (1 eixo)', categoria: ACESSORIOS, descricao: 'R$26.900,00' },
  { nome: 'Carretinha p/ Plataforma 30 pés (2 eixos, 6 pneus)', categoria: ACESSORIOS, descricao: 'R$35.900,00' },
  { nome: 'Carretinha p/ Plataforma 35 pés (2 eixos, 6 pneus)', categoria: ACESSORIOS, descricao: 'R$39.900,00' },
  { nome: 'Carretinha p/ Plataforma 35 pés (2 eixos, 10 pneus)', categoria: ACESSORIOS, descricao: 'R$45.900,00' },
  { nome: 'Carretinha p/ Plataforma 40 pés (2 eixos, 6 pneus)', categoria: ACESSORIOS, descricao: 'R$44.900,00' },
  { nome: 'Carretinha p/ Plataforma 40 pés (2 eixos, 10 pneus)', categoria: ACESSORIOS, descricao: 'R$49.900,00' },
  { nome: 'Carretinha p/ Plataforma 45 pés (2 eixos, 10 pneus)', categoria: ACESSORIOS, descricao: 'R$55.900,00' },
  { nome: 'Carretinha p/ Plataforma 45 pés (3 eixos, 12 pneus)', categoria: ACESSORIOS, descricao: 'R$63.900,00' },
  { nome: 'Carretinha p/ Plataforma 50 pés (2 eixos, 10 pneus)', categoria: ACESSORIOS, descricao: 'R$59.900,00' },
  { nome: 'Carretinha p/ Plataforma 50 pés (3 eixos, 12 pneus)', categoria: ACESSORIOS, descricao: 'R$69.900,00' },

  // Rolo Faca
  { nome: 'Rolo Faca Café 1,80m', categoria: ACESSORIOS, descricao: 'R$35.000,00' },
  { nome: 'Rolo Faca 3,00m', categoria: ACESSORIOS, descricao: 'R$45.000,00' },
  { nome: 'Rolo Faca 4,00m', categoria: ACESSORIOS, descricao: 'R$49.000,00' },
  { nome: 'Rolo Faca 7,00m', categoria: ACESSORIOS, descricao: 'R$98.000,00' },
  { nome: 'Rolo Faca 9,00m', categoria: ACESSORIOS, descricao: 'R$149.000,00' },
  { nome: 'Rolo Faca 11,00m', categoria: ACESSORIOS, descricao: 'R$178.000,00' },
]

async function main() {
  console.log(`Total: ${produtos.length} produtos`)
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(produtos, null, 2))
    return
  }
  console.log(`Inserindo para Agrokhan (${TENANT_ID})...`)
  const rows = produtos.map((p) => ({ ...p, tenant_id: TENANT_ID, ativo: true }))
  const { data, error } = await supabase.from('produtos').insert(rows).select('id, nome')
  if (error) {
    console.error('Erro ao inserir:', error.message)
    process.exit(1)
  }
  console.log(`OK — ${data.length} produtos inseridos.`)
}

main()
