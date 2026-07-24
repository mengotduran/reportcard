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
  /** Whether the session survives a full app restart. False = in-memory only for this
   *  run; the next cold start reads nothing back and the user must sign in again. */
  rememberMe: boolean
  _hasHydrated: boolean
  login: (token: string, user: User, school: School | null, rememberMe?: boolean) => void
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
      rememberMe: true,
      _hasHydrated: false,
      login: (token, user, school, rememberMe = true) => set({ token, user, school, isAuthenticated: true, rememberMe }),
      logout: () => set({ token: null, user: null, school: null, isAuthenticated: false, activeSession: null, rememberMe: true }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setSchool: (school) => set({ school }),
      setActiveSession: (session) => set({ activeSession: session }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // rememberMe=false: only that flag survives to disk, so a full restart hydrates
      // back to the logged-out defaults instead of restoring token/user/school.
      partialize: (state) => (state.rememberMe ? state : { rememberMe: false }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
