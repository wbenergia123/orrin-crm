import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Users,
  Scissors,
  CalendarDays,
  MessageSquare,
  UserCog,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pacientes', icon: Kanban, label: 'Pipeline' },
  { to: '/clientes', icon: Users, label: 'Pacientes' },
  { to: '/servicos', icon: Scissors, label: 'Serviços' },
  { to: '/profissionais', icon: UserCog, label: 'Profissionais' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/atendimentos', icon: MessageSquare, label: 'Atendimentos' },
]

export function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="w-16 md:w-56 flex flex-col h-full bg-white border-r border-gray-100 py-6 px-2 md:px-4">
      <div className="mb-8 px-2 hidden md:block">
        <span className="font-bold text-gray-800 text-sm tracking-wide uppercase">
          Clínica
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        onClick={logout}
        className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors mt-4"
      >
        <LogOut size={18} />
        <span className="hidden md:inline">Sair</span>
      </button>
    </aside>
  )
}
