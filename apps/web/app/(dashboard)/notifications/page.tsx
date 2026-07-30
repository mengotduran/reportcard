'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CalendarClock, ChevronRight } from 'lucide-react'
import { getMyNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi, notificationHref, AppNotification } from '@/lib/api/notifications'
import { useAuthStore } from '@/lib/store/auth.store'
import { onRealtime } from '@/lib/socket'
import { useT } from '@/lib/i18n'

export default function NotificationsPage() {
  const t = useT()
  const router = useRouter()
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    getMyNotificationsApi().then((r) => setNotifications(r.notifications)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // The bell in the layout was already live, but this LIST was not — so a new notification
  // bumped the badge while the page beside it still showed the old messages until a manual
  // reload. Same signal, same refetch.
  useEffect(() => onRealtime('notifications:changed', load), [load])

  const handleClick = (n: AppNotification) => {
    // Marking read is fire-and-forget so the navigation is never waiting on the network.
    if (!n.readAt) {
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      markNotificationReadApi(n.id).catch(() => { /* local state already updated; next load reconciles */ })
    }
    const href = notificationHref(n.data, user?.id)
    if (href) router.push(href)
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
            // A read notification with somewhere to go stays clickable — the timetable is
            // worth reopening long after the message itself has been seen.
            const canOpen = !!notificationHref(n.data, user?.id)
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                // Unread rows need their own hover, or the row you most want to click is the
                // one that does not respond. Reads use the shared --hover token (see
                // globals.css) rather than bg-muted, which is invisible on a dark card.
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-4 transition ${
                  unread
                    ? 'border-primary bg-primary/5 hover:bg-primary/10 dark:hover:bg-primary/15'
                    : 'border-border bg-card hover:bg-hover'
                } ${canOpen ? 'cursor-pointer' : ''}`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${unread ? 'bg-primary' : 'bg-transparent'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t(n.title)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">{formatTime(n.createdAt)}</p>
                  {canOpen && (
                    <p className="text-xs font-semibold text-primary mt-1.5 flex items-center gap-1">
                      <CalendarClock size={12} /> {t('Click to view the timetable')}
                    </p>
                  )}
                </div>
                {canOpen && <ChevronRight size={16} className="text-muted-foreground self-center flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
