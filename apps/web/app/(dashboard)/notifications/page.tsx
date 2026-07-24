'use client'
import { useEffect, useState, useCallback } from 'react'
import { Bell, Check } from 'lucide-react'
import { getMyNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi, AppNotification } from '@/lib/api/notifications'
import { useT } from '@/lib/i18n'

export default function NotificationsPage() {
  const t = useT()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    getMyNotificationsApi().then((r) => setNotifications(r.notifications)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleRead = async (n: AppNotification) => {
    if (n.readAt) return
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    try { await markNotificationReadApi(n.id) } catch { /* local state already updated; next load reconciles */ }
  }

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    try { await markAllNotificationsReadApi() } catch { /* next load reconciles */ }
  }

  const hasUnread = notifications.some((n) => !n.readAt)

  const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Notifications')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Teacher absence reports and updates')}</p>
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAll}
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
          >
            <Check size={14} /> {t('Mark all as read')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t("You're all caught up.")}</p>
        </div>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {notifications.map((n) => {
            const unread = !n.readAt
            return (
              <button
                key={n.id}
                onClick={() => handleRead(n)}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-4 transition ${
                  unread ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${unread ? 'bg-primary' : 'bg-transparent'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t(n.title)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">{formatTime(n.createdAt)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
