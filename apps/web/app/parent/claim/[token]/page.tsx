'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { previewClaimApi, claimInviteApi, ClaimPreview } from '@/lib/api/parent'
import AuthBackground from '@/components/ui/AuthBackground'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { GraduationCap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'

// Public on purpose, and deliberately NOT inside the portal layout's guard: a parent
// redeeming this link has no account yet, so the token in the URL is the only credential
// there can be. The preview call reveals only the child's name and school, never marks or
// fees, so a guessed token buys nothing.
export default function ClaimPage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params?.token ?? '')
  const setAuth = useAuthStore((s) => s.setAuth)

  const [preview, setPreview] = useState<ClaimPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [deadLink, setDeadLink] = useState('')

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    previewClaimApi(token)
      .then(setPreview)
      .catch((err) => setDeadLink(err?.response?.data?.message || 'This link is no longer valid.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match')
      return
    }
    setSaving(true)
    try {
      const data = await claimInviteApi({ token, password, name: name.trim() || undefined })
      // Straight into the portal: making a parent who just set a password type it again is
      // pure friction, and the server already handed back a session.
      setAuth(data.user, null, data.token)
      router.replace('/parent')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Could not set up your account. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 bg-background overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="text-primary" size={26} />
          <span className="text-xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>Bulletin</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
        ) : deadLink ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <AlertCircle className="mx-auto text-destructive mb-3" size={28} />
            <h1 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              This link has expired
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{deadLink}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account? <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
            </p>
          </div>
        ) : preview ? (
          <div className="bg-card border border-border rounded-2xl p-6">
            <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>
              Set up your account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              You are being given access to <span className="font-semibold text-foreground">{preview.studentName}</span>
              {preview.className ? <> in {preview.className}</> : null} at {preview.schoolName}.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Your name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mrs. Nguemo Jane"
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Create a password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError('') }} required
                    className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Repeat the password <span className="text-destructive">*</span>
                </label>
                <input type={showPassword ? 'text' : 'password'} value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (error) setError('') }} required
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={saving}
                className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {saving ? 'Setting up...' : 'Create my account'}
              </button>

              {/* Whatever this link was delivered to is what they sign in with, so say which
                  one rather than assuming the WhatsApp route. */}
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                You will sign in from now on with{' '}
                {preview.loginWith === 'email' ? 'your email address' : 'your phone number'}
                {preview.loginIdentifier ? <>, <span className="text-foreground font-medium">{preview.loginIdentifier}</span></> : null}.
              </p>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
