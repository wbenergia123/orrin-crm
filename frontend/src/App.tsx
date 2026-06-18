import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { supabase } from './lib/supabase'
import { getTenantSlug } from './lib/tenant'
import { AppShell } from './components/AppShell'
import LandingPage from './pages/LandingPage'
import OrgNaoEncontrada from './pages/OrgNaoEncontrada'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import SuperAdminApp from './pages/SuperAdminApp'
import Prospeccao from './pages/Prospeccao'
import Clientes from './pages/Clientes'
import Reunioes from './pages/Reunioes'

const slug = getTenantSlug()

function ClientApp() {
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const isSetPassword = window.location.pathname === '/set-password'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const { data: org, isLoading: orgLoading, error } = useQuery({
    queryKey: ['org', slug],
    queryFn: () =>
      axios
        .get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/orgs/by-slug/${slug}`)
        .then(r => r.data),
    enabled: !!slug && slug !== 'admin' && !isSetPassword,
  })

  if (isSetPassword) return <SetPassword />

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Carregando...</div>
      </div>
    )
  }

  if (error || !org?.ativo) return <OrgNaoEncontrada slug={slug!} />
  if (!session) return <Login orgNome={org.nome} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Prospeccao />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/reunioes" element={<Reunioes />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  if (slug === null)    return <LandingPage />
  if (slug === 'admin') return <SuperAdminApp />
  return <ClientApp />
}
