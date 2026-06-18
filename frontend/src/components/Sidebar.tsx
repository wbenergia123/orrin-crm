import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/reunioes', icon: Calendar, label: 'Reuniões' },
]

export function Sidebar() {
  return (
    <aside className="w-16 md:w-56 flex flex-col h-full bg-white border-r border-gray-100 py-6 px-2 md:px-4 shrink-0">
      <div className="mb-8 px-2 hidden md:block">
        <span className="font-bold text-gray-800 text-sm tracking-wide uppercase">
          Orrin CRM
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
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors mt-4"
      >
        <LogOut size={18} className="shrink-0" />
        <span className="hidden md:inline">Sair</span>
      </button>
    </aside>
  )
}
