'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { Users, BookOpen, FileText, School, LogOut, LayoutDashboard, Calendar, ShieldCheck, Settings, GraduationCap, Palette, Star, MessageSquare, Menu, X, ClipboardList, Wallet, CalendarRange, BookMarked, CalendarClock, CalendarCheck } from 'lucide-react'
import ActivityTracker from '@/components/ActivityTracker'
import AuthGuard from '@/components/AuthGuard'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { useT } from '@/lib/i18n'
import { getMeApi, updateLanguagePreferenceApi } from '@/lib/api/auth'
import { getAcademicYearsApi } from '@/lib/api/dashboard'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

const ADMIN_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/dashboard' },
  { icon: CalendarRange,   label: 'Academic Year', href: '/academic-year' },
  { icon: Users,           label: 'Students',     href: '/students' },
  { icon: GraduationCap,   label: 'Classes',      href: '/classes' },
  { icon: BookOpen,        label: 'Subjects',     href: '/subjects' },
  { icon: Calendar,        label: 'Terms',        href: '/terms' },
  { icon: Wallet,          label: 'Fees',             href: '/fees' },
  { icon: BookMarked,      label: 'HND Registration', href: '/hnd-registration', examRegistration: true },
  { icon: FileText,        label: 'Report Cards',     href: '/report-cards' },
  { icon: Palette,         label: 'Card Design',  href: '/report-card-design' },
  { icon: ClipboardList,   label: 'Class List',   href: '/class-list-design' },
  { icon: Star,            label: 'Grading',      href: '/grading-scale' },
  { icon: School,          label: 'Teachers',     href: '/teachers' },
  { icon: CalendarClock,   label: 'Timetable',    href: '/timetable' },
  { icon: CalendarCheck,   label: 'Attendance',   href: '/teaching-hours' },
  { icon: Settings,        label: 'Settings',     href: '/settings' },
]

const TEACHER_NAV = [
  { icon: LayoutDashboard, label: 'Home',    href: '/dashboard' },
  { icon: FileText,        label: 'Classes', href: '/report-cards' },
  { icon: CalendarClock,   label: 'My Timetable', href: '/my-timetable' },
  { icon: CalendarCheck,   label: 'My Attendance', href: '/my-teaching-hours' },
  { icon: Settings,        label: 'Settings', href: '/account' },
]

const CLASS_MASTER_NAV = [
  { icon: LayoutDashboard, label: 'Home',     href: '/dashboard' },
  { icon: FileText,        label: 'Classes',  href: '/report-cards' },
  { icon: MessageSquare,   label: 'My Class', href: '/class-master' },
  { icon: CalendarClock,   label: 'My Timetable', href: '/my-timetable' },
  { icon: CalendarCheck,   label: 'My Attendance', href: '/my-teaching-hours' },
  { icon: Settings,        label: 'Settings', href: '/account' },
]

const SUPERADMIN_NAV = [
  { icon: ShieldCheck, label: 'Schools', href: '/superadmin' },
]

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, school, logout, updateSchool, updateUser, activeSession, setActiveSession } = useAuthStore()
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
  const navItems = baseNavItems
    .filter((item) => !(item as { examRegistration?: boolean }).examRegistration || school?.type === 'UNIVERSITY' || school?.type === 'SECONDARY')
    .map((item) => {
      if (school?.type === 'UNIVERSITY' && (UNIVERSITY_NAV_LABELS[item.label] || UNIVERSITY_NAV_HREFS[item.href])) {
        return {
          ...item,
          label: UNIVERSITY_NAV_LABELS[item.label] ?? item.label,
          href: UNIVERSITY_NAV_HREFS[item.href] ?? item.href,
        }
      }
      if (school?.type === 'SECONDARY' && SECONDARY_NAV_LABELS[item.label]) return { ...item, label: SECONDARY_NAV_LABELS[item.label] }
      return item
    })

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useBodyScrollLock(mobileNavOpen)
  const currentLang = (user?.preferredLanguage ?? school?.language ?? 'EN') === 'FR' ? 'FR' : 'EN'

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
          <div className="px-5 py-4 border-b border-border flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-5 h-5 bg-primary rounded-[4px] flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={12} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="font-bold text-[14px] text-foreground tracking-tight truncate">Bulletin</span>
              </div>
              {!isSuperAdmin && school?.name && (
                <span className="block text-[12px] font-medium text-foreground/80 truncate mb-0.5">{school.name}</span>
              )}
              <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                {isSuperAdmin ? 'Superadmin' : (school?.type ? t(school.type) : '')}
              </span>
            </div>
            {/* Close button — mobile only */}
            <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="md:hidden text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1">
              <X size={18} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <button
                  key={item.label}
                  onClick={() => { router.push(item.href); setMobileNavOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-colors ${
                    isActive
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon size={14} className={isActive ? 'text-primary' : ''} />
                  {t(item.label)}
                </button>
              )
            })}
          </nav>

          {/* User + controls */}
          <div className="px-2 py-3 border-t border-border space-y-0.5">
            <div className="flex items-center gap-2.5 px-3 py-2">
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.role ? t(user.role.replace(/_/g, ' ')) : ''}</p>
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-[7px] rounded-md hover:bg-muted transition-colors">
              <span className="text-[13px] text-muted-foreground">{t('Appearance')}</span>
              <ThemeToggle compact />
            </div>

            {!isSuperAdmin && (
              <div className="flex items-center justify-between px-3 py-[7px] rounded-md hover:bg-muted transition-colors">
                <span className="text-[13px] text-muted-foreground">{t('Language')}</span>
                <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                  {(['EN', 'FR'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLangToggle(lang)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded transition-colors ${
                        currentLang === lang
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { logout(); router.push('/login') }}
              className="w-full flex items-center gap-2 px-3 py-[7px] text-[13px] text-muted-foreground hover:text-destructive hover:bg-muted rounded-md transition-colors"
            >
              <LogOut size={13} /> {t('Logout')}
            </button>
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
