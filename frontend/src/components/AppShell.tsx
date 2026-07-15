import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '../hooks/useAuth'

export function AppShell() {
  const { impersonatingOrg } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {impersonatingOrg && (
          <div
            role="status"
            className="bg-amber-500 text-amber-950 text-sm px-4 py-2 flex items-center justify-between shrink-0"
          >
            <span>
              Visualizando <strong>{impersonatingOrg.nome}</strong> · somente leitura
            </span>
            <a href="https://admin.orrin.com.br/admin" className="underline font-medium">
              Voltar ao painel admin
            </a>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-gray-100 via-gray-100 to-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
