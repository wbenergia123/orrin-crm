import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Vendedor só acessa Pipeline e Atendimentos — qualquer outra rota redireciona
// pro Pipeline. Segurança de dados é o backend (blockVendedor/blockVendedorWrites
// em app.ts); isso aqui é só UX pra não deixar a tela quebrar tentando carregar
// dados que a API vai recusar.
export function VendedorRoute() {
  const { usuario } = useAuth()
  if (usuario?.role === 'vendedor') {
    return <Navigate to="/pacientes" replace />
  }
  return <Outlet />
}
