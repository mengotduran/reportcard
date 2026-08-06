'use client'
import { Check, X } from 'lucide-react'
import { passwordChecks } from '@/lib/passwordValidation'

// Live feedback under a new-password field — shared by ChangePasswordCard, teacher/admin
// creation (no-email path), and the emailed set-password page. Only shown once the user has
// started typing, so an empty field doesn't open with a wall of red crosses.
export default function PasswordChecklist({ password }: { password: string }) {
  if (!password) return null
  const checks = passwordChecks(password)
  return (
    <ul className="mt-1.5 space-y-0.5">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.met ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {c.met ? <Check size={12} /> : <X size={12} className="text-destructive/60" />}
          {c.label}
        </li>
      ))}
    </ul>
  )
}
