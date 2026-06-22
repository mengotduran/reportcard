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
  logo: string | null
  coverImage: string | null
  coverImages: string[]
}

interface AuthState {
  token: string | null
  user: User | null
  school: School | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  login: (token: string, user: User, school: School | null) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
  setSchool: (school: School) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      school: null,
      isAuthenticated: false,
      _hasHydrated: false,
      login: (token, user, school) => set({ token, user, school, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, school: null, isAuthenticated: false }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setSchool: (school) => set({ school }),
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
