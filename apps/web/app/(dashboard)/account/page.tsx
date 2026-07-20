'use client'
import { useAuthStore } from '@/lib/store/auth.store'
import ChangePasswordCard from '@/components/ui/ChangePasswordCard'
import { UserCircle } from 'lucide-react'
import { useT } from '@/lib/i18n'

// A self-service account page reachable by every role. Admins already have
// Settings > Account for this; teachers and class masters have no settings
// page of their own at all, so this is their only way to change a password
// without asking an admin to reset it for them.
export default function AccountPage() {
  const { user } = useAuthStore()
  const t = useT()

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('My Account')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Manage your own sign-in details')}</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <UserCircle size={17} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">{user?.name}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        </div>
      </div>

      <ChangePasswordCard />
    </div>
  )
}
