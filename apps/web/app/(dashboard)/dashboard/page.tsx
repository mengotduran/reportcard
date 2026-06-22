'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getDashboardStatsApi, getWeeklyStatsApi, getTeacherChartStatsApi, WeeklyStats, TeacherChartStats } from '@/lib/api/dashboard'
import { Users, BookOpen, FileText, School, GraduationCap, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import ImageSlider from '@/components/ui/ImageSlider'
import { useT, useLocaleCode } from '@/lib/i18n'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts'

interface Stats { students: number; teachers: number; reportCards: number; subjects: number }

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  PRIMARY:    { bg: 'bg-primary',    text: 'text-primary' },
  SECONDARY:  { bg: 'bg-violet-600', text: 'text-violet-600' },
  UNIVERSITY: { bg: 'bg-orange-500', text: 'text-orange-500' },
}

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER']

const CHART_CONFIG = [
  { key: 'students' as const,    label: 'Students',     color: '#F03E2F', type: 'area' as const,  icon: Users,    statKey: 'students' as const },
  { key: 'reportCards' as const, label: 'Report Cards', color: '#7c3aed', type: 'line' as const,  icon: FileText, statKey: 'reportCards' as const },
  { key: 'teachers' as const,    label: 'Teachers',     color: '#16a34a', type: 'bar' as const,   icon: School,   statKey: 'teachers' as const },
  { key: 'subjects' as const,    label: 'Subjects',     color: '#ea580c', type: 'bar' as const,   icon: BookOpen, statKey: 'subjects' as const },
]

function TrendIndicator({ data }: { data: number[] }) {
  const t = useT()
  const last = data[data.length - 1] ?? 0
  const prev = data[data.length - 2] ?? 0
  const delta = last - prev
  if (delta > 0) return <span className="flex items-center gap-1 text-green-500 text-xs font-semibold"><TrendingUp size={13} />+{delta} {t('this week')}</span>
  if (delta < 0) return <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown size={13} />{delta} {t('this week')}</span>
  return <span className="flex items-center gap-1 text-muted-foreground text-xs font-semibold"><Minus size={13} />{t('No change')}</span>
}

type ChartCfg = {
  key: 'students' | 'reportCards' | 'teachers' | 'subjects'
  label: string
  color: string
  type: 'area' | 'line' | 'bar'
  icon: typeof Users
  statKey: 'students' | 'reportCards' | 'teachers' | 'subjects'
}

function WeeklyChart({ cfg, weekData, total }: { cfg: ChartCfg; weekData: WeeklyStats; total: number }) {
  const t = useT()
  const chartData = weekData.labels.map((label, i) => ({ label, value: weekData[cfg.key][i] ?? 0 }))
  const Icon = cfg.icon

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold text-foreground">{total.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">{t(cfg.label)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: cfg.color + '18' }}>
            <Icon size={18} style={{ color: cfg.color }} />
          </div>
          <TrendIndicator data={weekData[cfg.key]} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={90}>
        {cfg.type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Area type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} fill={`url(#grad-${cfg.key})`} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        ) : cfg.type === 'line' ? (
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Bar dataKey="value" fill={cfg.color} radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>

      <p className="text-xs text-muted-foreground text-right -mt-1">{t('8-week trend')}</p>
    </div>
  )
}

// ── Teacher / Class Master home ──────────────────────────────────────────────
function TeacherHome() {
  const { user, school } = useAuthStore()
  const t = useT()
  const locale = useLocaleCode()
  const router = useRouter()
  const [chartStats, setChartStats] = useState<TeacherChartStats | null>(null)
  const [chartLoading, setChartLoading] = useState(true)
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const logoUrl = school?.logo ?? null
  const sliderImages: string[] = ((school as any)?.coverImages?.length > 0 ? (school as any).coverImages : school?.coverImage ? [school.coverImage] : [])
  const initials = school?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'SC'
  const colors = TYPE_COLORS[school?.type ?? 'PRIMARY'] ?? TYPE_COLORS.PRIMARY
  const isClassMaster = user?.role === 'CLASS_MASTER'

  useEffect(() => {
    getTeacherChartStatsApi()
      .then(setChartStats)
      .catch(() => {})
      .finally(() => setChartLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      {/* Hero — full bleed (negative margins cancel main's padding at each breakpoint) */}
      <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8 relative min-h-[260px] md:min-h-[300px] flex items-center">
        {sliderImages.length > 0 ? (
          <div className="absolute inset-0">
            <ImageSlider images={sliderImages} className="w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#18060a] via-[#1c1c1f] to-[#101112]" />
        )}
        <div className="relative px-5 py-8 md:px-10 md:py-10 flex items-center gap-4 md:gap-6 w-full">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover border-2 border-white/40 shadow-lg flex-shrink-0" />
          ) : (
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl ${colors.bg} flex items-center justify-center shadow-lg border-2 border-white/30 flex-shrink-0`}>
              <span className="text-white font-black text-2xl tracking-tight">{initials}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-base md:text-lg text-white font-bold truncate min-w-0 max-w-full">{school?.name}</p>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white border border-white/20 flex-shrink-0">{school?.type ? t(school.type) : ''}</span>
            </div>
            <p className="text-white/60 text-sm">{t(getGreeting())}, <span className="text-white font-semibold">{user?.name}</span></p>
            <p className="text-white/40 text-xs mt-1">{user?.role ? t(user.role.replace(/_/g, ' ')) : ''} · {today}</p>
          </div>
          <button
            onClick={() => router.push('/report-cards')}
            className="hidden md:flex flex-shrink-0 items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white rounded-xl px-5 py-3 font-semibold text-sm transition backdrop-blur-sm"
          >
            <GraduationCap size={18} />
            {isClassMaster ? t('Manage Remarks') : t('Enter My Classes')}
            <ArrowRight size={15} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* Same WeeklyChart as admin — students & subjects */}
      {(() => {
        const studentTotal = chartStats?.studentCounts.reduce((s, c) => s + c.count, 0) ?? 0
        const subjectTotal = chartStats?.subjectCounts.reduce((s, c) => s + c.count, 0) ?? 0
        const studentData = chartStats?.weeklyStudents ?? new Array(8).fill(0)
        const subjectValues = chartStats?.subjectCounts.map(c => c.count) ?? []
        const subjectData = [...new Array(Math.max(0, 8 - subjectValues.length)).fill(0), ...subjectValues].slice(-8)
        const mockWeekly: WeeklyStats = {
          labels: chartStats?.labels ?? Array(8).fill(''),
          students: studentData,
          reportCards: subjectData,
          teachers: new Array(8).fill(0),
          subjects: new Array(8).fill(0),
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WeeklyChart
              cfg={{ key: 'students', label: 'My Students', color: '#F03E2F', type: 'area', icon: Users, statKey: 'students' }}
              weekData={mockWeekly}
              total={studentTotal}
            />
            <WeeklyChart
              cfg={{ key: 'reportCards', label: 'My Subjects', color: '#ea580c', type: 'bar', icon: BookOpen, statKey: 'reportCards' }}
              weekData={mockWeekly}
              total={subjectTotal}
            />
          </div>
        )
      })()}

      {/* CTA mobile */}
      <button
        onClick={() => router.push('/report-cards')}
        className="md:hidden w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#d63429] text-white rounded-xl px-6 py-4 font-semibold text-base transition shadow-md shadow-primary/20"
      >
        <GraduationCap size={20} />
        {isClassMaster ? 'Manage Remarks' : 'Enter My Classes'}
        <ArrowRight size={18} className="ml-auto opacity-70" />
      </button>
    </div>
  )
}

// ── Admin / VP dashboard ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, school } = useAuthStore()
  const t = useT()
  const locale = useLocaleCode()
  const [stats, setStats] = useState<Stats | null>(null)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [loading, setLoading] = useState(true)

  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')

  // Only fetch school-specific stats for admin/VP — superadmin has no schoolId (redirected
  // to /superadmin by layout, but useEffect fires before that redirect completes)
  useEffect(() => {
    if (!isAdminRole) { setLoading(false); return }
    Promise.all([getDashboardStatsApi(), getWeeklyStatsApi()])
      .then(([s, w]) => { setStats(s); setWeeklyStats(w) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isAdminRole])

  if (TEACHER_ROLES.includes(user?.role ?? '')) return <TeacherHome />
  if (!isAdminRole) return null  // superadmin: render nothing while redirect is in flight

  const colors = TYPE_COLORS[school?.type ?? 'PRIMARY'] ?? TYPE_COLORS.PRIMARY
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
