'use client'
import { useState } from 'react'
import { forgotPasswordApi } from '@/lib/api/auth'
import ThemeToggle from '@/components/ui/ThemeToggle'
import AuthBackground from '@/components/ui/AuthBackground'
import { AlertCircle, CheckCircle2, GraduationCap, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await forgotPasswordApi(email.trim())
      // Always shown regardless of whether the email exists — the API responds
      // with the same message either way, so this page can't reveal it either.
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
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
          {sent ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 size={32} className="text-green-600 mx-auto" />
              <h1 className="text-lg font-bold text-foreground">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                If <strong>{email.trim()}</strong> is registered, a password reset link has been sent to it. The link expires in 1 hour.
              </p>
              <a href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline pt-2">
                <ArrowLeft size={14} /> Back to sign in
              </a>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#262016] dark:text-white tracking-tight">Forgot password?</h1>
                <p className="text-[#5f5648] dark:text-white/60 mt-1.5 text-sm">
                  Enter your login email and we'll send you a link to reset it.
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                    placeholder="you@school.com"
                    autoComplete="username"
                    autoFocus
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
                  disabled={loading || !email.trim()}
                  className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </div>

              <a href="/login" className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-[#6f6553] dark:text-white/50 hover:text-primary transition-colors">
                <ArrowLeft size={14} /> Back to sign in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
