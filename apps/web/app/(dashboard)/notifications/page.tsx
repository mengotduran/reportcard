'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, CalendarDays, ChevronRight } from 'lucide-react'
import { getMyNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi, notificationHref, AppNotification } from '@/lib/api/notifications'
import { useAuthStore } from '@/lib/store/auth.store'
import { onRealtime } from '@/lib/socket'
import { useT, useLocaleCode } from '@/lib/i18n'

type Filter = 'all' | 'unread' | 'wholeDay'

/**
 * Initials for the avatar tile. Takes the first and last word so "Dr. Arnold Onana" reads
 * AO rather than DA — the title is noise, the surname is not.
 */
function initials(name: string): string {
  const words = name.trim().replace(/^(Dr|Mr|Mrs|Ms|Mme|M|Prof)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

/**
 * Whether the absence covered a whole day, and which courses it touched.
 *
 * Both are read out of the notification BODY, because neither is stored on
 * `Notification.data` (see NotificationLink — it carries the link target, not a description
 * of the absence). The body is written by the API in English at creation time and is never
 * user input, so the phrasing is stable, but this is still string-sniffing: if the wording
 * in createAbsence changes, these quietly stop matching and the badge/chips just disappear.
 * Deliberately fail-soft for that reason, and see the note in the page header about storing
 * them properly instead.
 */
function describeAbsence(n: { type: string; body: string }): { wholeDay: boolean; subjects: string[] } {
  // Absence kinds only. A course-reassignment body ends with its own parenthetical — the
  // course list is formatted "Analysis (Level 2)" — so running the trailing-parenthesis
  // match over it would invent a chip reading "Level 2".
  if (!n.type.startsWith('TEACHER_ABSENCE')) return { wholeDay: false, subjects: [] }
  const wholeDay = /\bthe whole day\b/i.test(n.body)
  // The API appends the course list as a trailing parenthetical: "... (Analysis, Databases)."
  const match = n.body.match(/\(([^)]+)\)\s*\.?\s*$/)
  const subjects = match
    ? match[1].split(',').map((s) => s.trim()).filter(Boolean)
    : []
  return { wholeDay, subjects }
}

export default function NotificationsPage() {
  const t = useT()
  const locale = useLocaleCode()
  const router = useRouter()
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(() => {
    getMyNotificationsApi().then((r) => setNotifications(r.notifications)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // The bell in the layout was already live, but this LIST was not — so a new notification
  // bumped the badge while the page beside it still showed the old messages until a manual
  // reload. Same signal, same refetch.
  useEffect(() => onRealtime('notifications:changed', load), [load])

  const handleOpen = (n: AppNotification) => {
    // Marking read is fire-and-forget so the navigation is never waiting on the network.
    markRead(n)
    const href = notificationHref(n.data, user?.id)
    if (href) router.push(href)
  }

  const markRead = (n: AppNotification) => {
    if (n.readAt) return
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    markNotificationReadApi(n.id).catch(() => { /* local state already updated; next load reconciles */ })
  }

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    try { await markAllNotificationsReadApi() } catch { /* next load reconciles */ }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length

  const visible = useMemo(() => notifications.filter((n) => {
    if (filter === 'unread') return !n.readAt
    if (filter === 'wholeDay') return describeAbsence(n).wholeDay
    return true
  }), [notifications, filter])

  /**
   * Rows bucketed by the DAY they arrived, newest bucket first, preserving the API's order
   * within each. Today and yesterday are named; anything older gets its date, which is more
   * use than "5 days ago" when you are looking for a particular report.
   */
  const groups = useMemo(() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const today = startOfDay(new Date())
    const dayMs = 86400000
    const out: { key: string; label: string; items: AppNotification[] }[] = []
    for (const n of visible) {
      const day = startOfDay(new Date(n.createdAt))
      const label = day === today
        ? t('Today')
        : day === today - dayMs
          ? t('Yesterday')
          : new Date(n.createdAt).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
      const last = out[out.length - 1]
      if (last && last.key === String(day)) last.items.push(n)
      else out.push({ key: String(day), label, items: [n] })
    }
    return out
  }, [visible, locale, t])

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })

  /** "Tuesday, 4 August 2026" — the date the absence is FOR, not when it was reported. */
  const formatAbsenceDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: t('All') },
    { id: 'unread', label: t('Unread'), count: unreadCount },
    { id: 'wholeDay', label: t('Whole day') },
  ]

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Notifications')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Teacher absence reports and updates')}</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="flex-shrink-0 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-hover transition"
          >
            <CheckCheck size={15} /> {t('Mark all read')}
          </button>
        )}
      </div>

      {/* Filter tabs. Whole day is worth its own tab because it is the case an admin most
          often goes looking for: a full day missed is what has to be covered. */}
      <div className="flex items-center gap-1 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              filter === tab.id
                ? 'bg-hover text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count ? (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-[11px] font-bold text-white">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {filter === 'all' ? t("You're all caught up.") : t('Nothing here under this filter.')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/70 mb-2 px-1">
                {group.label}
              </p>
              {/* One card per day with hairline-separated rows, rather than a card per row:
                  these arrive in bursts (a whole day booked at once), and separate cards made
                  four reports from one teacher read as four unrelated events. */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                {group.items.map((n) => {
                  const unread = !n.readAt
                  const link = n.data
                  const name = link?.teacherName || t(n.title)
                  const { wholeDay, subjects } = describeAbsence(n)
                  const absenceDate = link?.date || link?.dateFrom
                  // A read notification with somewhere to go stays clickable — the timetable is
                  // worth reopening long after the message itself has been seen.
                  const href = notificationHref(link, user?.id)

                  return (
                    <div
                      key={n.id}
                      onClick={() => href && handleOpen(n)}
                      className={`group relative flex items-start gap-3 px-4 py-3.5 transition ${
                        href ? 'cursor-pointer hover:bg-hover' : ''
                      }`}
                    >
                      {/* Unread marker sits in the gutter so the name starts at the same x on
                          every row — a dot that pushed the text across would make the list
                          ragged exactly where it should be scannable. */}
                      <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} />

                      <span
                        className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                          unread ? 'bg-primary/10 text-primary' : 'bg-hover text-muted-foreground'
                        }`}
                      >
                        {initials(name)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${unread ? 'font-bold text-foreground' : 'font-semibold text-muted-foreground'}`}>
                            {name}
                          </span>
                          {wholeDay ? (
                            <span className="flex-shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {t('Whole day')}
                            </span>
                          ) : link?.periods ? (
                            <span className="flex-shrink-0 rounded-md bg-hover px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {link.periods} {link.periods === 1 ? t('period') : t('periods')}
                            </span>
                          ) : null}
                          {/* The timestamp moves inline on hover so the actions can own the
                              right-hand side without the row reflowing. */}
                          <span className="hidden group-hover:inline text-xs text-muted-foreground">
                            {formatTime(n.createdAt)}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground mt-0.5">
                          {absenceDate
                            ? `${link?.retracted ? t('Absence removed') : t('Absent')} · ${formatAbsenceDate(absenceDate)}`
                            : n.body}
                        </p>

                        {subjects.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {subjects.map((s) => (
                              <span key={s} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Resting state: time + chevron. Hover: the two things worth doing to a
                          notification, so neither needs the row to be opened first. */}
                      <div className="flex-shrink-0 flex items-center gap-1.5 self-center group-hover:hidden">
                        <span className="text-xs text-muted-foreground">{formatTime(n.createdAt)}</span>
                        {href && <ChevronRight size={15} className="text-muted-foreground" />}
                      </div>
                      <div className="flex-shrink-0 hidden group-hover:flex items-center gap-1.5 self-center">
                        {href && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpen(n) }}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-hover transition"
                          >
                            <CalendarDays size={13} /> {t('Timetable')}
                          </button>
                        )}
                        {unread && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead(n) }}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-hover transition"
                          >
                            <Check size={13} /> {t('Mark read')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
