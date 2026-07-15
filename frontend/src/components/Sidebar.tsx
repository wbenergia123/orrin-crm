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
  Settings,
  Building2,
  DollarSign,
  Box,
  Package,
  Lock,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '@/lib/utils'
import orrinIcon from '../assets/orrin-icon.png'

type NavItem = { to: string; icon: typeof LayoutDashboard; label: string; vertical?: 'clinica' | 'agro'; labelAgro?: string; adminOnly?: boolean; financeiroOnly?: boolean; studio3d?: boolean }

const navItems: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pacientes', icon: Kanban, label: 'Pipeline' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/produtos', icon: Package, label: 'Produtos', vertical: 'agro' },
  { to: '/servicos', icon: Scissors, label: 'Serviços', vertical: 'clinica' },
  { to: '/profissionais', icon: UserCog, label: 'Profissionais', labelAgro: 'Vendedores' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/atendimentos', icon: MessageSquare, label: 'Atendimentos' },
  { to: '/financeiro', icon: DollarSign, label: 'Financeiro', financeiroOnly: true },
  { to: '/studio-3d', icon: Box, label: 'Studio 3D', studio3d: true, vertical: 'clinica' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
  { to: '/admin', icon: Building2, label: 'Admin', adminOnly: true },
]

// Vendedor só vê Pipeline e Atendimentos — o resto (Dashboard, Clientes,
// Produtos, Vendedores, Agenda, Financeiro, Configurações) é escondido aqui
// e travado no backend (blockVendedor/blockVendedorWrites em app.ts).
const VENDEDOR_ALLOWED = ['/pacientes', '/atendimentos']

export function Sidebar() {
  const { logout, usuario } = useAuth()

  const meuVertical = usuario?.role === 'super_admin' ? 'clinica' : (usuario?.vertical ?? 'clinica')
  const visibleItems = navItems.filter((item) => {
    if (usuario?.role === 'vendedor' && !VENDEDOR_ALLOWED.includes(item.to)) return false
    if (item.vertical && item.vertical !== meuVertical) return false
    if (item.adminOnly && usuario?.role !== 'super_admin') return false
    if (item.financeiroOnly) {
      return usuario?.role === 'admin' || usuario?.role === 'super_admin'
    }
    return true
  })

  const studioLiberado = usuario?.role === 'super_admin' || usuario?.studio_3d_ativo === true

  return (
    <aside className="w-16 md:w-56 flex flex-col h-full bg-white border-r border-gray-100 py-6 px-2 md:px-4">
      <div className="mb-8 px-2 hidden md:flex items-center gap-2">
        <img src={orrinIcon} alt="Orrin" className="w-6 h-6 object-contain" />
        <span className="font-bold text-gray-800 text-sm tracking-wide uppercase">
          Orrin
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {visibleItems.map((item) => {
          const { to, icon: Icon, studio3d } = item
          const label = meuVertical === 'agro' && item.labelAgro ? item.labelAgro : item.label
          if (studio3d && !studioLiberado) {
            return (
              <div
                key={to}
                title="Recurso não habilitado para sua clínica — fale com o suporte"
                className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-gray-300 cursor-not-allowed select-none"
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden md:inline" translate="no">{label}</span>
                <Lock size={12} className="hidden md:block ml-auto" />
              </div>
            )
          }
          return (
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
              <span className="hidden md:inline" translate="no">{label}</span>
            </NavLink>
          )
        })}
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
