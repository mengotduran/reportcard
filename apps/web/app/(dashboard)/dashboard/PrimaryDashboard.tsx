'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getDashboardStatsApi, getWeeklyStatsApi, getAcademicYearsApi, WeeklyStats, AcademicYear } from '@/lib/api/dashboard'
import { Users, BookOpen, FileText, School, ArrowRight, CalendarRange } from 'lucide-react'
import ImageSlider from '@/components/ui/ImageSlider'
import SetupChecklist from '@/components/SetupChecklist'
import TeacherHome from '@/components/dashboard/TeacherHome'
import WeeklyChart from '@/components/dashboard/WeeklyChart'
import { useT, useLocaleCode } from '@/lib/i18n'

interface Stats { students: number; teachers: number; reportCards: number; subjects: number }

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const TYPE_COLORS = { bg: 'bg-primary', text: 'text-primary' }

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER']

const CHART_CONFIG = [
  { key: 'students' as const,    label: 'Students',     color: '#F03E2F', type: 'area' as const,  icon: Users,    statKey: 'students' as const },
  { key: 'reportCards' as const, label: 'Report Cards', color: '#7c3aed', type: 'line' as const,  icon: FileText, statKey: 'reportCards' as const },
  { key: 'teachers' as const,    label: 'Teachers',     color: '#16a34a', type: 'bar' as const,   icon: School,   statKey: 'teachers' as const },
  { key: 'subjects' as const,    label: 'Subjects',     color: '#ea580c', type: 'bar' as const,   icon: BookOpen, statKey: 'subjects' as const },
]

// ── Admin / VP dashboard — PRIMARY schools ─────────────────────────────────
export default function PrimaryDashboard() {
  const { user, school, activeSession } = useAuthStore()
  const router = useRouter()
  const t = useT()
  const locale = useLocaleCode()
  const [stats, setStats] = useState<Stats | null>(null)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<AcademicYear[]>([])
  const session = activeSession ?? ''

  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')

  // Only fetch school-specific stats for admin/VP — superadmin has no schoolId (redirected
  // to /superadmin by layout, but useEffect fires before that redirect completes)
  useEffect(() => {
    if (!isAdminRole) { setLoading(false); return }
    Promise.all([getWeeklyStatsApi(), getAcademicYearsApi()])
      .then(([w, y]) => { setWeeklyStats(w); setYears(y.academicYears) })
      .catch(console.error)
  }, [isAdminRole])

  // Stats follow the app-wide active academic year.
  useEffect(() => {
    if (!isAdminRole || !session) return
    setLoading(true)
    getDashboardStatsApi(session)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isAdminRole, session])

  if (TEACHER_ROLES.includes(user?.role ?? '')) return <TeacherHome />
  if (!isAdminRole) return null  // superadmin: render nothing while redirect is in flight

  const colors = TYPE_COLORS
  const initials = school?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'SC'
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const logoUrl = school?.logo ?? null
  const sliderImages: string[] = ((school as any)?.coverImages?.length > 0 ? (school as any).coverImages : school?.coverImage ? [school.coverImage] : [])

  const statCards = [
    { label: 'Total Students',  value: stats?.students,    icon: Users,     color: 'bg-primary/10 text-primary' },
    { label: 'Total Teachers',  value: stats?.teachers,    icon: School,    color: 'bg-green-500/10 text-green-500' },
    { label: 'Report Cards',    value: stats?.reportCards, icon: FileText,  color: 'bg-violet-500/10 text-violet-500' },
    { label: 'Subjects',        value: stats?.subjects,    icon: BookOpen,  color: 'bg-orange-500/10 text-orange-500' },
  ]

  const emptyWeekly: WeeklyStats = { labels: Array(8).fill(''), students: Array(8).fill(0), reportCards: Array(8).fill(0), teachers: Array(8).fill(0), subjects: Array(8).fill(0) }

  return (
    <div className="space-y-6">
      {/* Hero banner — full bleed */}
      <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8 relative min-h-[240px] md:min-h-[280px] flex items-end">
        {sliderImages.length > 0 && (
          <div className="absolute inset-0">
            <ImageSlider images={sliderImages} className="w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/40 to-transparent" />
          </div>
        )}
        {sliderImages.length === 0 && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#18060a] via-[#1c1c1f] to-[#101112]" />
        )}
        <div className="relative p-5 md:p-6 flex items-center gap-4 md:gap-5 w-full">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover border-2 border-white/30 shadow-lg flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/15 border-2 border-white/30 flex items-center justify-center shadow-lg flex-shrink-0 backdrop-blur-sm">
              <span className="text-white font-black text-2xl tracking-tight">{initials}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold text-white truncate min-w-0">{school?.name}</h1>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white border border-white/20 flex-shrink-0">{school?.type ? t(school.type) : ''}</span>
            </div>
            <p className="text-sm text-white/60 mt-1">{today}</p>
            <p className="text-sm text-white/90 mt-2">{t(getGreeting())}, <span className="font-semibold text-white">{user?.name?.split(' ')[0]}</span> 👋</p>
          </div>
        </div>
      </div>

      <SetupChecklist />

      {/* Active academic year — read-only; switch on the Academic Year page */}
      {session && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarRange size={18} className="text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground">{t('Showing data for academic year')}</span>
            <span className="text-sm font-bold text-foreground">{session}</span>
            {years.find((y) => y.session === session)?.current && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t('Current')}</span>
            )}
          </div>
          <button onClick={() => router.push('/academic-year')}
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1 flex-shrink-0">
            {t('Change year')} <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center mb-3`}>
              <card.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {loading
                ? <span className="inline-block w-8 h-7 bg-muted rounded animate-pulse" />
                : (card.value ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{t(card.label)}</p>
          </div>
        ))}
      </div>

      {/* Weekly trend charts */}
      <div>
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">{t('Weekly Trends')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {CHART_CONFIG.map((cfg) => (
            <WeeklyChart
              key={cfg.key}
              cfg={cfg}
              weekData={weeklyStats ?? emptyWeekly}
              total={stats?.[cfg.statKey] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
