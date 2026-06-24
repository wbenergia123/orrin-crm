import 'dotenv/config'
import { supabaseAdmin } from '../src/services/supabase'

const TENANT_ID = process.argv[2] || '07ada562-2820-41e3-9423-82c66e7f92c3'
const UAZAPI_URL = process.env.UAZAPI_URL
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN

if (!UAZAPI_URL) {
  console.error('UAZAPI_URL não está definida no ambiente. Nada a fazer.')
  process.exit(1)
}

async function main() {
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    [
      { tenant_id: TENANT_ID, chave: 'uazapi_url', valor: UAZAPI_URL },
      { tenant_id: TENANT_ID, chave: 'uazapi_token', valor: UAZAPI_TOKEN || '' },
    ],
    { onConflict: 'tenant_id,chave' }
  )

  if (error) {
    console.error('Erro ao salvar configuração UAZAPI:', error.message)
    process.exit(1)
  }

  console.log(`Backfill UAZAPI concluído para tenant ${TENANT_ID}`)
}

main()
