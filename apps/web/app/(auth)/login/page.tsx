'use client'
import { useState } from 'react'
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
  const [email, setEmail] = useState(_email)
  const [password, setPassword] = useState(_password)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)

  const handleEmailChange = (v: string) => {
    _email = v; setEmail(v)
    if (error) setError('')
  }
  const handlePasswordChange = (v: string) => {
    _password = v; setPassword(v)
    if (error) setError('')
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    const start = Date.now()
    try {
      const data = await loginApi(email.trim(), password)
      setAuth(data.user, data.school, data.token)
      _email = ''
      _password = ''
      window.location.href = '/dashboard'
    } catch {
      // Always show the spinner for at least 500 ms so users know the request happened
      const elapsed = Date.now() - start
      if (elapsed < 500) await new Promise<void>((r) => setTimeout(r, 500 - elapsed))
      setError('Incorrect email or password. Please try again.')
      setErrorKey((k) => k + 1)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 relative overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0);   }
          15%       { transform: translateX(-5px); }
          30%       { transform: translateX(5px);  }
          45%       { transform: translateX(-4px); }
          60%       { transform: translateX(4px);  }
          75%       { transform: translateX(-2px); }
          90%       { transform: translateX(2px);  }
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

          {/* Inline error — keyed so the shake animation re-fires on every failed attempt */}
          {error && (
            <div
              key={errorKey}
              className="flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm"
              style={{ animation: 'shake 0.5s ease-out' }}
            >
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

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
