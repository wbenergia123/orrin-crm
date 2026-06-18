import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcrypt'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(url, key)

async function main() {
  const email = 'batttista@gmail.com'
  const senha = '123456'

  // Check if user exists
  const { data: existing } = await supabase
    .from('usuarios')
    .select('id, email')
    .eq('email', email)
    .single()

  if (existing) {
    console.log('✓ Usuário já existe:', existing)
    process.exit(0)
  }

  // Create user
  const senhaHash = await bcrypt.hash(senha, 10)
  const { data: novo, error } = await supabase
    .from('usuarios')
    .insert([{ email, senha_hash: senhaHash, role: 'admin' }])
    .select('id, email')
    .single()

  if (error) {
    console.error('✗ Erro ao criar usuário:', error)
    process.exit(1)
  } else {
    console.log('✓ Usuário criado:', novo)
    process.exit(0)
  }
}

main()
