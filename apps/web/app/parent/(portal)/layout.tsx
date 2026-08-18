'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth.store'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { GraduationCap, LogOut } from 'lucide-react'

// A route group, so the claim page at /parent/claim/[token] stays OUTSIDE this guard —
// a parent redeeming an invite has no session yet and must not be bounced to login.
//
// Its own guard rather than the dashboard's AuthGuard: that one assumes a school-scoped
// staff user, and a parent has no school at all (User.schoolId is null by design). A
// signed-in member of staff who lands here is sent to their own dashboard instead of being
// shown an empty portal.
export default function ParentPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, user, _hasHydrated, logout } = useAuthStore()

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated) { router.replace('/login'); return }
    if (user?.role !== 'PARENT') router.replace('/dashboard')
  }, [_hasHydrated, isAuthenticated, user?.role, router])

  const handleLogout = () => { logout(); router.replace('/login') }

  // Render nothing until the store has rehydrated and the role is known, so a parent never
  // sees a flash of the wrong screen.
  if (!_hasHydrated || !isAuthenticated || user?.role !== 'PARENT') return null

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/parent" className="flex items-center gap-2">
            <GraduationCap className="text-primary" size={22} />
            <span className="text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>Bulletin</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-muted-foreground">{user?.name}</span>
            <ThemeToggle />
            <button onClick={handleLogout} title="Sign out"
              className="text-muted-foreground hover:text-foreground transition">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
