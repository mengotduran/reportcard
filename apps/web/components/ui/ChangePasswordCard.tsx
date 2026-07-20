'use client'
import { useState } from 'react'
import { KeyRound, Eye, EyeOff } from 'lucide-react'
import { changeMyPasswordApi } from '@/lib/api/auth'
import { useToast } from '@/lib/useToast'
import Toast from './Toast'

const FIELD = 'w-full border border-border rounded-lg px-3 py-2 pr-9 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50'

// Self-service password change — works for every role, online and offline (no
// email involved, unlike the forgot-password flow). Dropped into Settings >
// Account for admins and into /account for teachers/class masters, who have no
// Settings page of their own.
export default function ChangePasswordCard() {
  const { toast, showToast, hideToast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const canSubmit = current.length > 0 && next.length >= 6 && next === confirm

  const handleSubmit = async () => {
    if (!canSubmit) return
    if (next.length < 6) { showToast('New password must be at least 6 characters', 'error'); return }
    if (next !== confirm) { showToast('New passwords do not match', 'error'); return }
    setSaving(true)
    try {
      await changeMyPasswordApi(current, next)
      showToast('Password changed successfully')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to change password', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <KeyRound size={17} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">Change Password</h3>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">Update the password you sign in with</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Password</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={FIELD}
              autoComplete="current-password"
            />
            <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password</label>
          <input
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm New Password</label>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && handleSubmit()}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoComplete="new-password"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !canSubmit}
          className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-[#d63429] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Change Password'}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
