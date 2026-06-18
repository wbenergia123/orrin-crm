import { create } from 'zustand'

interface AuthState {
  token: string | null
  usuario: { id: string; email: string; role: string } | null
  login: (token: string, usuario: AuthState['usuario']) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  usuario: null,
  login: (token, usuario) => {
    localStorage.setItem('token', token)
    set({ token, usuario })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, usuario: null })
  },
}))
