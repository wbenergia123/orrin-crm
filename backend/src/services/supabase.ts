// backend/src/services/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!

// Cliente anon — respeita RLS (use em rotas autenticadas normais)
export const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)

// Cliente admin — bypassa RLS (use APENAS em rotas públicas e super admin)
export const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
