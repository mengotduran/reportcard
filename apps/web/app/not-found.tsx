'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import AuthBackground from '@/components/ui/AuthBackground'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { GraduationCap, ArrowLeft, Home } from 'lucide-react'

// Caught by Next for any unmatched route in the app. Lives at the app root rather than inside
// a route group so it also covers URLs that match no group at all (a mistyped /studens, an
// old bookmark), which a group-scoped not-found would miss.
//
// Deliberately NOT wrapped in AuthGuard: a 404 has to render for a signed-out visitor too,
// and bouncing them to the login screen would hide the fact that the address was simply
// wrong. The primary action adapts to whoever is looking instead.
export default function NotFound() {
  const router = useRouter()
  const { isAuthenticated, _hasHydrated } = useAuthStore()

  // The store rehydrates from localStorage after the first paint. Until it has, neither
  // destination is known to be right, so the primary action waits rather than rendering a
  // "Go to dashboard" button that turns into "Sign in" a moment later.
  const homeHref = isAuthenticated ? '/dashboard' : '/login'
  const homeLabel = isAuthenticated ? 'Go to dashboard' : 'Go to sign in'

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 bg-background overflow-hidden">
      <AuthBackground />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <GraduationCap className="text-primary" size={26} />
          <span className="text-xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>
            Bulletin
          </span>
        </div>

        <p
          className="text-[88px] leading-none font-semibold text-primary/25 select-none"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          404
        </p>

        <h1
          className="mt-2 text-2xl font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          This page does not exist
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          The address may have been typed wrong, or the page may have been moved or removed.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-hover transition"
          >
            <ArrowLeft size={16} />
            Go back
          </button>

          {_hasHydrated && (
            <Link
              href={homeHref}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-[#d63429] transition"
            >
              <Home size={16} />
              {homeLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
