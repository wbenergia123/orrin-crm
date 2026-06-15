// frontend/src/App.tsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { supabase } from './lib/supabase'
import { getTenantSlug } from './lib/tenant'
import LandingPage from './pages/LandingPage'
import OrgNaoEncontrada from './pages/OrgNaoEncontrada'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import SuperAdminApp from './pages/SuperAdminApp'
import Prospeccao from './pages/Prospeccao'
import Clientes from './pages/Clientes'
import Reunioes from './pages/Reunioes'
import './App.css'

const slug = getTenantSlug()

function ClientApp() {
  const [session, setSession] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState('prospeccao')
  const isSetPassword = window.location.pathname === '/set-password'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const { data: org, isLoading, error } = useQuery({
    queryKey: ['org', slug],
    queryFn: () =>
      axios
        .get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/orgs/by-slug/${slug}`)
        .then(r => r.data),
    enabled: !!slug && slug !== 'admin',
  })

  if (isSetPassword) return <SetPassword />
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    )
  }
  if (error || !org?.ativo) return <OrgNaoEncontrada slug={slug!} />
  if (!session) return <Login orgNome={org.nome} />

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">{org.nome}</h1>
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setCurrentPage('prospeccao')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'prospeccao' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentPage('clientes')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'clientes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Clientes
              </button>
              <button
                onClick={() => setCurrentPage('reunioes')}
                className={`px-4 py-2 rounded font-medium transition ${currentPage === 'reunioes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                Reuniões
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main>
        {currentPage === 'prospeccao' && <Prospeccao />}
        {currentPage === 'clientes' && <Clientes />}
        {currentPage === 'reunioes' && <Reunioes />}
      </main>
    </div>
  )
}

export default function App() {
  if (slug === null)    return <LandingPage />
  if (slug === 'admin') return <SuperAdminApp />
  return <ClientApp />
}
