import { create } from 'zustand'

interface AuthState {
  token: string | null
  usuario: { id: string; email: string; role: string } | null
  login: (token: string, usuario: AuthState['usuario']) => void
  logout: () => void
}

const storedUsuario = localStorage.getItem('usuario')

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  usuario: storedUsuario ? JSON.parse(storedUsuario) : null,
  login: (token, usuario) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    set({ token, usuario })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    set({ token: null, usuario: null })
  },
}))
