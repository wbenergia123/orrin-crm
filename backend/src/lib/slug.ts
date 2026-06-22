// backend/src/lib/slug.ts

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/
const RESERVED = [
  'admin', 'api', 'app', 'www', 'mail', 'blog', 'docs',
  'status', 'cdn', 'static', 'help', 'support'
]

export function validarSlug(slug: string): void {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Slug é obrigatório')
  }
  const lower = slug.toLowerCase()
  if (!SLUG_REGEX.test(lower)) {
    throw new Error('Slug inválido — use apenas letras minúsculas, números e hífen')
  }
  if (RESERVED.includes(lower)) {
    throw new Error(`Slug '${lower}' é reservado`)
  }
  if (lower.length > 63) {
    throw new Error('Slug muito longo — máximo 63 caracteres')
  }
}
