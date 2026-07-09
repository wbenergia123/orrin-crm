import { create } from 'zustand'

interface ImpersonatingOrg {
  id: string
  slug: string
  nome: string
}

interface AuthState {
  token: string | null
  usuario: { id: string; email: string; role: string; studio_3d_ativo?: boolean } | null
  impersonatingOrg: ImpersonatingOrg | null
  login: (token: string, usuario: AuthState['usuario'], impersonatingOrg?: ImpersonatingOrg | null) => void
  logout: () => void
}

const storedUsuario = localStorage.getItem('usuario')
const storedImpersonatingOrg = localStorage.getItem('impersonatingOrg')

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  usuario: storedUsuario ? JSON.parse(storedUsuario) : null,
  impersonatingOrg: storedImpersonatingOrg ? JSON.parse(storedImpersonatingOrg) : null,
  login: (token, usuario, impersonatingOrg = null) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    if (impersonatingOrg) {
      localStorage.setItem('impersonatingOrg', JSON.stringify(impersonatingOrg))
    } else {
      localStorage.removeItem('impersonatingOrg')
    }
    set({ token, usuario, impersonatingOrg })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    localStorage.removeItem('impersonatingOrg')
    set({ token: null, usuario: null, impersonatingOrg: null })
  },
}))
