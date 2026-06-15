'use client'
import { useState, useEffect, useRef } from 'react'
import { loginApi } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/store/auth.store'
import ThemeToggle from '@/components/ui/ThemeToggle'
import AuthBackground from '@/components/ui/AuthBackground'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

// Module-level cache — survives any component remount caused by Next.js
// hydration or Zustand store notifications. Cleared on successful login.
let _email = ''
let _password = ''

export default function LoginPage() {
  // Initialise from module cache so values survive remounts
  const [email, setEmail] = useState(_email)
  const [password, setPassword] = useState(_password)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Keep module cache in sync
  const handleEmailChange = (v: string) => { _email = v; setEmail(v) }
  const handlePasswordChange = (v: string) => { _password = v; setPassword(v) }

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!error) return
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 4000)
    return () => clearTimeout(errorTimer.current)
  }, [error])

  const handleLogin = async () => {
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const data = await loginApi(email.trim(), password)
      setAuth(data.user, data.school, data.token)
      // Clear cache on success then hard-navigate (avoids router subscription issues)
      _email = ''
      _password = ''
      window.location.href = '/dashboard'
    } catch {
      setError('One of your credentials is incorrect. Please check and try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 relative overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Toast — absolutely positioned, zero layout impact on the card */}
      {error && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-destructive text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg max-w-xs text-center"
          style={{ animation: 'slideDown 0.15s ease-out forwards' }}
        >
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-sm pt-[6vh] md:pt-[8vh]">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-6 h-6 bg-primary rounded-[4px] flex items-center justify-center">
            <span className="text-white text-[10px] font-black tracking-tight">RC</span>
          </div>
          <span className="font-semibold text-sm text-white tracking-tight">ReportCard</span>
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back</h1>
          <p className="text-white/60 mt-1.5 text-sm">Sign in to your school account</p>
        </div>

        {/* Card — no error box inside, layout is static */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && document.getElementById('pw-input')?.focus()}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
              placeholder="you@school.com"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="pw-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
                className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading || !email.trim() || !password}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-white/50">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  )
}
