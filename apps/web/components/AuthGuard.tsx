'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, _hasHydrated } = useAuthStore()

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push('/login')
    }
  }, [_hasHydrated, isAuthenticated, router])

  // Show nothing until hydration completes
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}
