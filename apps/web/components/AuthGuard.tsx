'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, _hasHydrated, user } = useAuthStore()

  // A parent signed in on the staff dashboard: their account is valid, so nothing bounces
  // them to login, but the API refuses a PARENT token on every staff route (denyParents), so
  // each screen renders its shell and then fails to load anything. Send them to their own
  // portal instead. Mirrors the same guard in the mobile app's tabs layout.
  const isParent = user?.role === 'PARENT'

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated) { router.push('/login'); return }
    if (isParent) router.replace('/parent')
  }, [_hasHydrated, isAuthenticated, isParent, router])

  // Show nothing until hydration completes
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated || isParent) return null

  return <>{children}</>
}
