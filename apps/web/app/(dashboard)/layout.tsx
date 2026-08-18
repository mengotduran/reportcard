'use client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { Users, BookOpen, FileText, School, LogOut, LayoutDashboard, Calendar, ShieldCheck, Settings, GraduationCap, Palette, Star, MessageSquare, Menu, X, ClipboardList, Wallet, CalendarRange, BookMarked, CalendarClock, CalendarCheck, Bell, Search, ChevronsUpDown, Award, TrendingUp } from 'lucide-react'
import ActivityTracker from '@/components/ActivityTracker'
import AuthGuard from '@/components/AuthGuard'
import ThemeToggle from '@/components/ui/ThemeToggle'
import ModalScrollLock from '@/components/ui/ModalScrollLock'
import { useT } from '@/lib/i18n'
import { getMeApi, updateLanguagePreferenceApi } from '@/lib/api/auth'
import { getAcademicYearsApi } from '@/lib/api/dashboard'
import { getMyNotificationsApi } from '@/lib/api/notifications'
import { connectSocket, disconnectSocket, onRealtime } from '@/lib/socket'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

const NOTIFICATION_ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
// Fallback interval only — the socket is the primary path now, so this is deliberately
// slow. It exists so a dead socket degrades to stale rather than frozen.
const NOTIFICATION_POLL_MS = 150000

const ADMIN_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/dashboard',      group: 'Overview' },
  { icon: CalendarRange,   label: 'Academic Year', href: '/academic-year', group: 'Overview' },
  { icon: Users,           label: 'Students',     href: '/students',       group: 'People' },
  { icon: School,          label: 'Teachers',     href: '/teachers',       group: 'People' },
  { icon: GraduationCap,   label: 'Classes',      href: '/classes',        group: 'Academics' },
  { icon: BookOpen,        label: 'Subjects',     href: '/subjects',       group: 'Academics' },
  { icon: Calendar,        label: 'Terms',        href: '/terms',          group: 'Academics' },
  { icon: CalendarClock,   label: 'Timetable',    href: '/timetable',      group: 'Academics' },
  { icon: CalendarCheck,   label: 'Attendance',   href: '/teaching-hours', group: 'Academics' },
  { icon: FileText,        label: 'Report Cards',     href: '/report-cards',        group: 'Records' },
  { icon: Palette,         label: 'Card Design',  href: '/report-card-design',      group: 'Records' },
  { icon: ClipboardList,   label: 'Class List',   href: '/class-list-design',       group: 'Records' },
  { icon: Star,            label: 'Grading',      href: '/grading-scale',           group: 'Records' },
  { icon: Award,           label: 'Promotion Scale', href: '/promotion-scale',      group: 'Records' },
  { icon: Wallet,          label: 'Fees',             href: '/fees',                group: 'Finance' },
  { icon: TrendingUp,      label: 'Revenue',          href: '/revenue',             group: 'Finance' },
  { icon: BookMarked,      label: 'HND Registration', href: '/hnd-registration', examRegistration: true, group: 'Finance' },
  { icon: Settings,        label: 'Settings',     href: '/settings',       group: 'System' },
]

const TEACHER_NAV = [
  { icon: LayoutDashboard, label: 'Home', group: 'Overview',    href: '/dashboard' },
  { icon: FileText,        label: 'Classes', group: 'Academics', href: '/report-cards' },
  { icon: CalendarClock,   label: 'My Timetable', group: 'Academics', href: '/my-timetable' },
  { icon: CalendarCheck,   label: 'My Attendance', group: 'Academics', href: '/my-teaching-hours' },
  { icon: Settings,        label: 'Settings', group: 'System', href: '/account' },
]

const CLASS_MASTER_NAV = [
  { icon: LayoutDashboard, label: 'Home', group: 'Overview',     href: '/dashboard' },
  { icon: FileText,        label: 'Classes', group: 'Academics',  href: '/report-cards' },
  { icon: MessageSquare,   label: 'My Class', group: 'Academics', href: '/class-master' },
  { icon: CalendarClock,   label: 'My Timetable', group: 'Academics', href: '/my-timetable' },
  { icon: CalendarCheck,   label: 'My Attendance', group: 'Academics', href: '/my-teaching-hours' },
  { icon: Settings,        label: 'Settings', group: 'System', href: '/account' },
]

const SUPERADMIN_NAV = [
  { icon: ShieldCheck, label: 'Schools', href: '/superadmin', group: 'Overview' },
]

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, school, token, logout, updateSchool, updateUser, activeSession, setActiveSession } = useAuthStore()
  const t = useT()

  // Refresh user+school once per session (login / hard reload) so a persisted session
  // — which can sit in localStorage for days — doesn't keep acting on a stale School
  // record. This used to skip the refetch entirely once preferredLanguage/school.language
  // were already cached, which meant policy fields like marksEntryMode never updated for
  // the rest of an already-open session: an admin could switch a school to ADMIN_ONLY and
  // a teacher's already-open tab would keep treating it as unrestricted until they logged
  // out and back in.
  useEffect(() => {
    if (!user) return
    getMeApi().then((me) => {
      if (me.school) updateSchool(me.school)
      if (me.preferredLanguage != null) updateUser({ preferredLanguage: me.preferredLanguage })
    }).catch(() => {})
  }, [user])

  // Make sure the app-wide active academic year is set to a valid year
  // (defaults to the live/current one). Persisted, so an activated year sticks.
  useEffect(() => {
    if (!user || isSuperAdmin) return
    getAcademicYearsApi().then(({ academicYears }) => {
      const live = academicYears.find((y) => y.current)?.session ?? academicYears[0]?.session
      if (live && (!activeSession || !academicYears.some((y) => y.session === activeSession))) setActiveSession(live)
    }).catch(() => {})
  }, [user])

  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const isTeacher = TEACHER_ROLES.includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isAdminRole = NOTIFICATION_ADMIN_ROLES.includes(user?.role ?? '')
  // Who gets the notification bell: admins (a teacher self-reported/retracted an absence)
  // AND teachers/class masters (an admin logged or removed an absence FOR them). The API
  // is role-agnostic — it returns each user's own notifications — so this is purely which
  // roles we surface the bell + poll to.
  const receivesNotifications = isAdminRole || isTeacher || isClassMaster
  const baseNavItems = isSuperAdmin ? SUPERADMIN_NAV : isClassMaster ? CLASS_MASTER_NAV : isTeacher ? TEACHER_NAV : ADMIN_NAV
  // Universities use different wording for the same routes/data — just relabel the nav.
  // Keyed by label (not href) since "Classes" appears on multiple hrefs across the
  // admin/teacher/class-master nav arrays above, all meaning the same ClassLevel entity.
  const UNIVERSITY_NAV_LABELS: Record<string, string> = {
    'Terms': 'Semesters',
    'Subjects': 'Courses',
    'Classes': 'Departments',
    'My Class': 'My Department',
  }
  // Relabelling the nav left the address bar contradicting it: clicking "Courses" landed
  // on /subjects. /courses re-exports the same page, so the url matches the word.
  const UNIVERSITY_NAV_HREFS: Record<string, string> = {
    '/subjects': '/courses',
  }
  // Secondary schools track exam (GCE) registration too — same feature, different label.
  const SECONDARY_NAV_LABELS: Record<string, string> = {
    'HND Registration': 'GCE Registration',
  }
  // Primary schools track exam (FSLC) registration for Class Six — same feature again.
  const PRIMARY_NAV_LABELS: Record<string, string> = {
    'HND Registration': 'FSLC Registration',
  }
  const navItems = baseNavItems
    .filter((item) => !(item as { examRegistration?: boolean }).examRegistration || school?.type === 'UNIVERSITY' || school?.type === 'SECONDARY' || school?.type === 'PRIMARY')
    .map((item) => {
      if (school?.type === 'UNIVERSITY' && (UNIVERSITY_NAV_LABELS[item.label] || UNIVERSITY_NAV_HREFS[item.href])) {
        return {
          ...item,
          label: UNIVERSITY_NAV_LABELS[item.label] ?? item.label,
          href: UNIVERSITY_NAV_HREFS[item.href] ?? item.href,
        }
      }
      if (school?.type === 'SECONDARY' && SECONDARY_NAV_LABELS[item.label]) return { ...item, label: SECONDARY_NAV_LABELS[item.label] }
      if (school?.type === 'PRIMARY' && PRIMARY_NAV_LABELS[item.label]) return { ...item, label: PRIMARY_NAV_LABELS[item.label] }
      return item
    })

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navQuery, setNavQuery] = useState('')
  useBodyScrollLock(mobileNavOpen)
  const currentLang = (user?.preferredLanguage ?? school?.language ?? 'EN') === 'FR' ? 'FR' : 'EN'

  // Real-time via socket, with the poll kept as a slower SAFETY NET rather than the primary
  // mechanism. If the socket fails to reconnect (dropped Wi-Fi, server restart, a proxy that
  // kills idle connections) the bell goes stale by a couple of minutes instead of silently
  // freezing forever, which is a failure mode that looks exactly like "no new notifications".
  // Still not true push: nothing arrives while the tab is closed.
  const [unreadCount, setUnreadCount] = useState(0)

  /**
   * The small right-hand figure on a nav row. Only shown where it is genuinely useful and
   * already known — the academic year, and unread notifications. Deliberately NOT a count of
   * students/teachers/courses: that would need extra requests on every page load to render
   * numbers nobody navigates by, and a stale one is worse than none.
   */
  const navMeta: Record<string, string | number> = {
    ...(activeSession ? { '/academic-year': activeSession.replace(/^(\d{4})\/(\d{2})\d{2}$/, '$1/$2') } : {}),
    ...(unreadCount > 0 ? { '/notifications': unreadCount } : {}),
  }

  // Grouped in the nav's own order, filtered by the jump-to box. Groups with nothing left
  // after filtering drop out entirely rather than leaving a bare heading.
  const navGroups = (() => {
    const q = navQuery.trim().toLowerCase()
    const visible = q ? navItems.filter((i) => t(i.label).toLowerCase().includes(q)) : navItems
    const groups: [string, typeof navItems][] = []
    for (const item of visible) {
      const name = (item as { group?: string }).group ?? 'Overview'
      const last = groups[groups.length - 1]
      if (last && last[0] === name) last[1].push(item)
      else groups.push([name, [item]])
    }
    return groups
  })()
  useEffect(() => {
    if (!user || !receivesNotifications || !token) return
    let cancelled = false
    const refresh = () => getMyNotificationsApi().then((r) => { if (!cancelled) setUnreadCount(r.unreadCount) }).catch(() => {})

    refresh()
    connectSocket(token)
    // The signal carries nothing, so this is the same fetch the poll makes — one code path
    // for both, which means the socket can't drift from what polling would have shown.
    const off = onRealtime('notifications:changed', refresh)
    const interval = setInterval(refresh, NOTIFICATION_POLL_MS)
    return () => { cancelled = true; off(); clearInterval(interval) }
  }, [user, receivesNotifications, token])

  const handleLangToggle = async (lang: 'EN' | 'FR') => {
    updateUser({ preferredLanguage: lang })
    updateLanguagePreferenceApi(lang).catch(() => {})
  }

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  useEffect(() => {
    if (isSuperAdmin && pathname === '/dashboard') router.replace('/superadmin')
  }, [isSuperAdmin, isTeacher, pathname])

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background flex">
        <ActivityTracker />
        {/* Locks the page behind any open modal. Renders nothing. */}
        <ModalScrollLock />

        {/* ── Mobile top bar (hamburger) ──────────────────────────────────── */}
        <header className="md:hidden fixed top-0 inset-x-0 h-14 z-30 bg-background border-b border-border flex items-center gap-3 px-4">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="text-foreground -ml-1 p-1">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-primary rounded-[6px] flex items-center justify-center flex-shrink-0">
              <GraduationCap size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[16px] text-foreground tracking-tight flex-shrink-0">Bulletin</span>
            {!isSuperAdmin && school?.name && (
              <span className="text-[13px] text-muted-foreground truncate border-l border-border pl-2">{school.name}</span>
            )}
          </div>
          {receivesNotifications && (
            <button
              onClick={() => router.push('/notifications')}
              aria-label="Notifications"
              className="relative ml-auto text-muted-foreground hover:text-foreground p-1"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </header>

        {/* ── Backdrop (mobile, when drawer open) ─────────────────────────── */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileNavOpen(false)} aria-hidden />
        )}

        {/* ── Sidebar / mobile drawer ─────────────────────────────────────── */}
        <aside
          className={`w-[220px] bg-background flex flex-col fixed h-full z-50 transition-transform duration-200 ease-out md:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ boxShadow: '2px 0 8px rgba(0,0,0,0.08)', borderRight: '1px solid var(--border)' }}
        >

          {/* Brand */}
          <div className="px-3 pt-3 pb-2 flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-[22px] h-[22px] bg-primary rounded-[6px] flex items-center justify-center flex-shrink-0">
                <GraduationCap size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[14px] text-foreground tracking-tight truncate">Bulletin</span>
            </div>
            <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="md:hidden text-muted-foreground hover:text-foreground p-1">
              <X size={18} />
            </button>
          </div>

          {/* School card — identity and the year being viewed, which is the context every
              figure on every page is scoped to. */}
          {!isSuperAdmin && school?.name && (
            <div className="mx-3 mb-2 px-3 py-2.5 rounded-lg border border-border bg-card">
              <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{school.name}</p>
              <p className="text-[10.5px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-primary inline-block flex-shrink-0" />
                {school.type ? t(school.type) : ''}{activeSession ? ` \u00b7 ${activeSession}` : ''}
              </p>
            </div>
          )}

          {/* Jump to — filters the nav rather than being decorative, so a long admin nav
              stops needing a scroll hunt. */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder={t('Jump to...')}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Nav, grouped */}
          <nav className="flex-1 px-2 pb-3 overflow-y-auto">
            {navGroups.map(([groupName, items]) => (
              <div key={groupName} className="mb-1">
                <p className="px-3 pt-2 pb-1 text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/70">
                  {t(groupName)}
                </p>
                {items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  const meta = navMeta[item.href]
                  return (
                    // A real <Link>, not a button calling router.push. Next only
                    // prefetches a route's JavaScript for <Link>, and on a slow
                    // connection that is the whole difference between a click that
                    // responds and one that appears to do nothing for several
                    // seconds while the chunk downloads. The onClick side effects
                    // (closing the drawer, clearing the filter) still run.
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => { setMobileNavOpen(false); setNavQuery('') }}
                      className={`relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-[7px] rounded-md text-[13px] transition-colors ${
                        isActive
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                      }`}
                    >
                      {/* Accent bar rather than a colour change alone, so the active row is
                          findable at a glance down a long list. */}
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-primary" />}
                      <item.icon size={14} className={isActive ? 'text-primary flex-shrink-0' : 'flex-shrink-0'} />
                      <span className="truncate flex-1 text-left">{t(item.label)}</span>
                      {meta != null && (
                        <span className={`text-[10px] tabular-nums flex-shrink-0 ${
                          typeof meta === 'number'
                            ? 'min-w-[17px] h-[17px] px-1 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center'
                            : 'text-muted-foreground'
                        }`}>
                          {meta}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
            {navGroups.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-muted-foreground text-center">{t('Nothing matches.')}</p>
            )}
          </nav>

          {/* User + controls — one identity row, then a single row of compact controls, so
              the footer costs four lines of height instead of five stacked rows. */}
          <div className="border-t border-border px-3 py-2.5">
            <button
              onClick={() => { router.push(isSuperAdmin ? '/superadmin' : '/account'); setMobileNavOpen(false) }}
              className="w-full flex items-center gap-2.5 px-1 py-1 rounded-md hover:bg-hover transition-colors text-left"
            >
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {(user?.name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{user?.name}</p>
                <p className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground truncate">
                  {user?.role ? t(user.role.replace(/_/g, ' ')) : ''}
                </p>
              </div>
              <ChevronsUpDown size={13} className="text-muted-foreground flex-shrink-0" />
            </button>

            <div className="flex items-center gap-1 mt-1.5 px-1">
              {receivesNotifications && (
                <button
                  onClick={() => { router.push('/notifications'); setMobileNavOpen(false) }}
                  title={t('Notifications')}
                  className={`relative p-1.5 rounded-md transition-colors ${
                    pathname === '/notifications' ? 'text-primary bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-hover'
                  }`}
                >
                  <Bell size={14} />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-destructive" />
                  )}
                </button>
              )}

              <ThemeToggle compact />

              {!isSuperAdmin && (
                <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 ml-0.5">
                  {(['EN', 'FR'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLangToggle(lang)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        currentLang === lang
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}

              <button
                // Drop the socket before clearing the session: it is still joined to this
                // user's rooms, and reusing it after a different login would deliver their
                // signals to the wrong person's screen.
                onClick={() => { disconnectSocket(); logout(); router.push('/login') }}
                title={t('Logout')}
                className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-hover transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-x-clip md:ml-[220px] p-4 pt-20 md:p-8 min-h-screen bg-background">
          {/* Keyed by route so each page gently fades in on navigation. Opacity-
              only (no transform) so it never creates a containing block that
              would disturb sticky/fixed children on any page. */}
          <div key={pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
