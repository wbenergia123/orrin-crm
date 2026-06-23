import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Impersonar() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    const orgId = params.get('org_id')
    const orgSlug = params.get('org_slug')
    const orgNome = params.get('org_nome')

    if (!token || !orgId || !orgSlug || !orgNome) {
      navigate('/login', { replace: true })
      return
    }

    login(token, { id: 'impersonating', email: '', role: 'admin' }, { id: orgId, slug: orgSlug, nome: orgNome })
    navigate('/dashboard', { replace: true })
    // login/navigate são estáveis e params só precisa ser lido uma vez, no mount —
    // rodar de novo a cada render re-disparia o handoff sem necessidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Entrando...
    </div>
  )
}
