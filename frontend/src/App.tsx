import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProtectedRoute } from './components/ProtectedRoute'
import { VerticalRoute } from './components/VerticalRoute'
import { VendedorRoute } from './components/VendedorRoute'
import { AppShell } from './components/AppShell'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Pacientes } from './pages/Pacientes'
import { FichaPaciente } from './pages/FichaPaciente'
import { Servicos } from './pages/Servicos'
import { Produtos } from './pages/Produtos'
import { Profissionais } from './pages/Profissionais'
import { Agenda } from './pages/Agenda'
import { AgendaAgro } from './pages/AgendaAgro'
import { Atendimentos } from './pages/Atendimentos'
import { Configuracoes } from './pages/Configuracoes'
import { Clientes } from './pages/Clientes'
import { Financeiro } from './pages/Financeiro'
import { FinanceiroAgro } from './pages/FinanceiroAgro'
import { Studio3D } from './pages/Studio3D'
import { Admin } from './pages/Admin'
import { Impersonar } from './pages/Impersonar'
import { useAuth } from './hooks/useAuth'

function AgendaPorVertical() {
  const { usuario } = useAuth()
  return usuario?.vertical === 'agro' ? <AgendaAgro /> : <Agenda />
}

function FinanceiroPorVertical() {
  const { usuario } = useAuth()
  return usuario?.vertical === 'agro' ? <FinanceiroAgro /> : <Financeiro />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 3
      },
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/impersonar" element={<Impersonar />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/pacientes" element={<Pacientes />} />
              <Route path="/atendimentos" element={<Atendimentos />} />

              <Route element={<VendedorRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route element={<VerticalRoute vertical="clinica" />}>
                  <Route path="/pacientes/:id" element={<FichaPaciente />} />
                  <Route path="/servicos" element={<Servicos />} />
                  <Route path="/studio-3d" element={<Studio3D />} />
                </Route>
                <Route element={<VerticalRoute vertical="agro" />}>
                  <Route path="/produtos" element={<Produtos />} />
                </Route>
                <Route path="/profissionais" element={<Profissionais />} />
                <Route path="/agenda" element={<AgendaPorVertical />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/financeiro" element={<FinanceiroPorVertical />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
              </Route>

              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
