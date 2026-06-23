'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { Users, BookOpen, FileText, School, LogOut, LayoutDashboard, Calendar, ShieldCheck, Settings, GraduationCap, Palette, Star, MessageSquare, Menu, X, ClipboardList, Wallet, CalendarRange } from 'lucide-react'
import ActivityTracker from '@/components/ActivityTracker'
import AuthGuard from '@/components/AuthGuard'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { useT } from '@/lib/i18n'
import { getMeApi } from '@/lib/api/auth'

const ADMIN_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/dashboard' },
  { icon: CalendarRange,   label: 'Academic Year', href: '/academic-year' },
  { icon: Users,           label: 'Students',     href: '/students' },
  { icon: GraduationCap,   label: 'Classes',      href: '/classes' },
  { icon: BookOpen,        label: 'Subjects',     href: '/subjects' },
  { icon: Calendar,        label: 'Terms',        href: '/terms' },
  { icon: Wallet,          label: 'Fees',         href: '/fees' },
  { icon: FileText,        label: 'Report Cards', href: '/report-cards' },
  { icon: Palette,         label: 'Card Design',  href: '/report-card-design' },
  { icon: ClipboardList,   label: 'Class List',   href: '/class-list-design' },
  { icon: Star,            label: 'Grading',      href: '/grading-scale' },
  { icon: School,          label: 'Teachers',     href: '/teachers' },
  { icon: Settings,        label: 'Settings',     href: '/settings' },
]

const TEACHER_NAV = [
  { icon: LayoutDashboard, label: 'Home',    href: '/dashboard' },
  { icon: FileText,        label: 'Classes', href: '/report-cards' },
]

const CLASS_MASTER_NAV = [
  { icon: LayoutDashboard, label: 'Home',     href: '/dashboard' },
  { icon: FileText,        label: 'Classes',  href: '/report-cards' },
  { icon: MessageSquare,   label: 'My Class', href: '/class-master' },
]

const SUPERADMIN_NAV = [
  { icon: ShieldCheck, label: 'Schools', href: '/superadmin' },
]

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, school, logout, updateSchool } = useAuthStore()
  const t = useT()

  // Refresh school once so persisted pre-i18n sessions pick up `language`.
  useEffect(() => {
    if (!user || isSuperAdmin) return
    if (school?.language) return
    getMeApi().then((me) => { if (me.school) updateSchool(me.school) }).catch(() => {})
  }, [user])

  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const isTeacher = TEACHER_ROLES.includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const navItems = isSuperAdmin ? SUPERADMIN_NAV : isClassMaster ? CLASS_MASTER_NAV : isTeacher ? TEACHER_NAV : ADMIN_NAV

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
            <div className="w-5 h-5 bg-primary rounded-[4px] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] font-black tracking-tight">RC</span>
            </div>
            <span className="font-semibold text-[13px] text-foreground tracking-tight truncate">
              {isSuperAdmin ? 'ReportCard' : (school?.name || 'ReportCard')}
            </span>
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
                  <span className="text-white text-[9px] font-black tracking-tight">RC</span>
                </div>
                <span className="font-semibold text-[13px] text-foreground tracking-tight truncate">
                  {isSuperAdmin ? 'ReportCard' : (school?.name || 'ReportCard')}
                </span>
              </div>
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
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
