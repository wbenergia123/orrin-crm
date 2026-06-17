// frontend/src/lib/tenant.ts

const ROOT_DOMAIN = 'orrin.com.br'
const RESERVED = [
  'www', 'admin', 'api', 'app', 'mail', 'blog', 'docs',
  'status', 'cdn', 'static', 'help', 'support'
]

export function getTenantSlug(): string | null {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_DEV_TENANT ?? 'demo'
  }

  const hostname = window.location.hostname

  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null

  const slug = hostname.replace(`.${ROOT_DOMAIN}`, '').toLowerCase()

  if (RESERVED.includes(slug)) return slug  // 'admin' is handled in App.tsx
  if (!/^[a-z0-9-]+$/.test(slug)) return null

  return slug
}
