const GRADIENT_COLORS = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#0891b2', '#be185d', '#4f46e5']

function corPorNome(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return GRADIENT_COLORS[Math.abs(h) % GRADIENT_COLORS.length]
}

export function getAvatarUrl(p: { id: string; nome: string; foto_url: string | null }): string {
  if (p.foto_url) return p.foto_url
  return `https://i.pravatar.cc/80?u=${p.id}`
}

export function getAvatarFallback(nome: string): string {
  const cor = corPorNome(nome)
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=${cor.replace('#', '')}&color=fff&size=80&bold=true&rounded=true`
}
