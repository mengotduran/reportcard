import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface User {
  id: string
  name: string
  email: string
  role: string
  schoolId: string | null
  masterClassLevel?: string | null
}

interface School {
  id: string
  name: string
  type: string
  language?: string
  /** Who records marks. ADMIN_ONLY = teachers see the marks sheet read-only and only
   *  administrators may save (the API enforces it; this only shapes the UI). Undefined on
   *  an older cached session reads as TEACHERS, matching the API's default. */
  marksEntryMode?: 'TEACHERS' | 'ADMIN_ONLY'
  logo: string | null
  coverImage: string | null
  coverImages: string[]
}

interface AuthState {
  token: string | null
  user: User | null
  school: School | null
  isAuthenticated: boolean
  /** The academic year (session, e.g. "2025/2026") the whole app is currently viewing. */
  activeSession: string | null
  _hasHydrated: boolean
  login: (token: string, user: User, school: School | null) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
  setSchool: (school: School) => void
  setActiveSession: (session: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      school: null,
      isAuthenticated: false,
      activeSession: null,
      _hasHydrated: false,
      login: (token, user, school) => set({ token, user, school, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, school: null, isAuthenticated: false, activeSession: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setSchool: (school) => set({ school }),
      setActiveSession: (session) => set({ activeSession: session }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
