// frontend/src/pages/SuperAdminApp.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

export default function SuperAdminApp() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [novaOrg, setNovaOrg] = useState({ slug: '', nome: '', admin_email: '' })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoginError('Credenciais inválidas'); return }
    setSession(data.session)
  }

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/api/admin/tenants').then(r => r.data),
    enabled: !!session,
  })

  const createMutation = useMutation({
    mutationFn: (org: typeof novaOrg) => api.post('/api/admin/tenants', org).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
      setNovaOrg({ slug: '', nome: '', admin_email: '' })
      setFormSuccess(`✅ Criado! URL: ${data.url} — Invite enviado para ${novaOrg.admin_email}`)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || 'Erro ao criar organização')
      setFormSuccess('')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.patch(`/api/admin/tenants/${id}`, { ativo }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg w-full max-w-sm">
          <h1 className="text-white text-2xl font-bold mb-6">Orrin Admin</h1>
          {loginError && <p className="text-red-400 text-sm mb-4">{loginError}</p>}
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded p-3 focus:outline-none focus:border-blue-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded p-3 focus:outline-none focus:border-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Orrin Admin</h1>
        <button
          onClick={() => supabase.auth.signOut().then(() => setSession(null))}
          className="text-gray-400 hover:text-white text-sm"
        >
          Sair
        </button>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Nova Organização</h2>

          {formError && <p className="mb-3 text-red-600 text-sm">{formError}</p>}
          {formSuccess && <p className="mb-3 text-green-600 text-sm">{formSuccess}</p>}

          <div className="grid grid-cols-3 gap-4 mb-4">
            <input
              type="text"
              placeholder="slug (ex: empresa-abc)"
              value={novaOrg.slug}
              onChange={e => setNovaOrg({ ...novaOrg, slug: e.target.value.toLowerCase() })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Nome da empresa"
              value={novaOrg.nome}
              onChange={e => setNovaOrg({ ...novaOrg, nome: e.target.value })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email do admin"
              value={novaOrg.admin_email}
              onChange={e => setNovaOrg({ ...novaOrg, admin_email: e.target.value })}
              className="border border-gray-300 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={() => createMutation.mutate(novaOrg)}
            disabled={createMutation.isPending}
            className="bg-blue-600 text-white px-6 py-3 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {createMutation.isPending ? 'Criando...' : '+ Criar Organização'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold text-gray-800">
              Organizações ({tenants.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Slug</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Nome</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">URL</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t: any) => (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-mono text-sm text-gray-700">{t.slug}</td>
                    <td className="p-4 text-gray-800">{t.nome}</td>
                    <td className="p-4">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${t.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <a
                        href={`https://${t.slug}.orrin.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {t.slug}.orrin.com
                      </a>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleMutation.mutate({ id: t.id, ativo: !t.ativo })}
                        className={`text-sm px-3 py-1 rounded border transition ${
                          t.ativo
                            ? 'border-red-300 text-red-600 hover:bg-red-50'
                            : 'border-green-300 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {t.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
