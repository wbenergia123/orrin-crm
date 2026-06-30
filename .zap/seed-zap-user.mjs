// Cria usuário de teste para o ZAP no ambiente de staging
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcrypt'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Cria org de teste
const { data: org } = await supabase
  .from('organizacoes')
  .upsert({ slug: 'zap-staging', nome: 'ZAP Staging', ativo: true }, { onConflict: 'slug' })
  .select()
  .single()

// Cria usuário admin de teste
const senhaHash = await bcrypt.hash('ZapTest2026!', 10)
await supabase
  .from('usuarios')
  .upsert({
    email: 'zap-test@orrin-staging.com',
    senha_hash: senhaHash,
    role: 'admin',
    tenant_id: org.id,
    ativo: true,
  }, { onConflict: 'email' })

console.log('ZAP seed OK — tenant_id:', org.id)
