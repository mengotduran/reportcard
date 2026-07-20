'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { resetPasswordApi } from '@/lib/api/auth'
import ThemeToggle from '@/components/ui/ThemeToggle'
import AuthBackground from '@/components/ui/AuthBackground'
import { Eye, EyeOff, AlertCircle, CheckCircle2, GraduationCap } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await resetPasswordApi(token, password)
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired. Request a new one.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-dvh relative overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 h-full overflow-y-auto flex flex-col items-center justify-center px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md">
            <GraduationCap size={22} className="text-white" strokeWidth={2.25} />
          </div>
          <span className="font-extrabold text-2xl text-[#262016] dark:text-white tracking-tight">Bulletin</span>
        </div>

        <div className="w-full max-w-sm">
          {!token ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
              <AlertCircle size={32} className="text-destructive mx-auto" />
              <h1 className="text-lg font-bold text-foreground">Invalid link</h1>
              <p className="text-sm text-muted-foreground">This reset link is missing its token. Request a new one from the sign-in page.</p>
              <a href="/forgot-password" className="inline-block text-sm font-medium text-primary hover:underline pt-2">Request a new link</a>
            </div>
          ) : done ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 size={32} className="text-green-600 mx-auto" />
              <h1 className="text-lg font-bold text-foreground">Password reset</h1>
              <p className="text-sm text-muted-foreground">Your password has been changed. Taking you to sign in…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#262016] dark:text-white tracking-tight">Set a new password</h1>
                <p className="text-[#5f5648] dark:text-white/60 mt-1.5 text-sm">Choose a new password for your account.</p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
                      className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); if (error) setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !password || !confirm}
                  className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Saving…' : 'Reset password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
