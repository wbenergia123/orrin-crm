import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Vertical errado não vê a tela — redireciona pro dashboard. Segurança de dados é o RLS/tenant_id no backend.
export function VerticalRoute({ vertical }: { vertical: 'clinica' | 'agro' }) {
  const { usuario } = useAuth()
  const meuVertical = usuario?.vertical ?? 'clinica'
  if (usuario?.role !== 'super_admin' && meuVertical !== vertical) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
