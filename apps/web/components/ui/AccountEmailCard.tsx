'use client'
import { useState, useEffect } from 'react'
import { Mail } from 'lucide-react'
import { updateMyEmailApi } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/store/auth.store'
import { useToast } from '@/lib/useToast'
import Toast from './Toast'

// Self-service "my login email" — works for anyone, but is the one way a username-only
// account (no email on file, see createTeacher/buildAdminAccount) adds a real email
// afterward, unlocking email-based password recovery going forward. The username keeps
// working as a login identifier too; it's never cleared by adding an email.
// Shared by /account (teachers/class masters) and Settings > Account (admins).
export default function AccountEmailCard() {
  const { user, updateUser } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const [value, setValue] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setValue(user?.email ?? '') }, [user?.email])

  const handleSave = async () => {
    const trimmed = value.trim()
    if (!trimmed) { showToast('Email is required', 'error'); return }
    setSaving(true)
    try {
      const res = await updateMyEmailApi(trimmed)
      updateUser({ email: res.email })
      showToast('Your email was updated')
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to update email', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Mail size={17} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">{user?.email ? 'Login Email' : 'Add an Email'}</h3>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            {user?.email
              ? 'Used to sign in — not the same as the school email in Settings'
              : `You currently sign in with the username "${user?.username}". Add an email below to also enable email-based password recovery — your username keeps working either way.`}
          </p>
        </div>
      </div>
      <div className="mt-5 max-w-sm">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Email <span className="text-destructive">*</span></label>
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-3 text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-[#d63429] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Email'}
        </button>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
