import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  role: string
  masterClassLevel?: string | null
  preferredLanguage?: string | null
}

interface School {
  id: string
  name: string
  type: string
  language?: string
  subdomain: string
  logo: string | null
  coverImage: string | null
  coverImages: string[]
  repeatThreshold?: number | null
  email?: string
  phone?: string | null
  address?: string | null
  website?: string | null
  authorizationNumber?: string | null
}

interface AuthState {
  user: User | null
  school: School | null
  token: string | null
  isAuthenticated: boolean
  lastActivity: number
  /** The academic year (session, e.g. "2025/2026") the whole app is currently viewing. */
  activeSession: string | null
  _hasHydrated: boolean
  setHasHydrated: (val: boolean) => void
  setAuth: (user: User, school: School | null, token: string) => void
  updateActivity: () => void
  updateSchool: (school: School) => void
  updateUser: (updates: Partial<User>) => void
  setActiveSession: (session: string) => void
  logout: () => void
}

const INACTIVITY_TIMEOUT = 30 * 60 * 1000

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      school: null,
      token: null,
      isAuthenticated: false,
      lastActivity: Date.now(),
      activeSession: null,
      _hasHydrated: false,
      setHasHydrated: (val) => set({ _hasHydrated: val }),
      setAuth: (user, school, token) => {
        localStorage.setItem('token', token)
        set({ user, school, token, isAuthenticated: true, lastActivity: Date.now() })
      },
      updateActivity: () => {
        const state = get()
        if (!state.isAuthenticated) return
        const now = Date.now()
        if (now - state.lastActivity > INACTIVITY_TIMEOUT) {
          localStorage.removeItem('token')
          set({ user: null, school: null, token: null, isAuthenticated: false })
          window.location.href = '/login'
          return
        }
        set({ lastActivity: now })
      },
      updateSchool: (school) => set({ school }),
      updateUser: (updates) => set(state => ({ user: state.user ? { ...state.user, ...updates } : null })),
      setActiveSession: (session) => set({ activeSession: session }),
      logout: () => {
        localStorage.removeItem('token')
        set({ user: null, school: null, token: null, isAuthenticated: false, activeSession: null })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        school: state.school,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        lastActivity: state.lastActivity,
        activeSession: state.activeSession,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
