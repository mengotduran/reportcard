'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getTeacherChartStatsApi, getTeacherClassesApi, TeacherChartStats, TeacherClassRow, WeeklyStats } from '@/lib/api/dashboard'
import { getCurrentTermApi, CurrentTerm } from '@/lib/api/terms'
import { getMyTimetableApi, TimetableSlot } from '@/lib/api/timetable'
import { Users, BookOpen, GraduationCap, ArrowRight, CalendarClock, CalendarDays, Clock } from 'lucide-react'
import ImageSlider from '@/components/ui/ImageSlider'
import MonthCalendar from '@/components/ui/MonthCalendar'
import WeeklyChart from './WeeklyChart'
import { useT, useLocaleCode } from '@/lib/i18n'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const TYPE_COLORS: Record<string, { bg: string }> = {
  PRIMARY: { bg: 'bg-primary' },
  SECONDARY: { bg: 'bg-violet-600' },
  UNIVERSITY: { bg: 'bg-orange-500' },
}

const DAY_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const DEPT_PALETTE = ['#F03E2F', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#db2777']

export default function TeacherHome() {
  const { user, school, activeSession } = useAuthStore()
  const t = useT()
  const locale = useLocaleCode()
  const router = useRouter()
  const [chartStats, setChartStats] = useState<TeacherChartStats | null>(null)
  const [classes, setClasses] = useState<TeacherClassRow[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [term, setTerm] = useState<CurrentTerm | null>(null)
  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([])
  const [timetableLoading, setTimetableLoading] = useState(true)
  const now = new Date()
  const today = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const monthLabel = now.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const logoUrl = school?.logo ?? null
  const sliderImages: string[] = ((school as any)?.coverImages?.length > 0 ? (school as any).coverImages : school?.coverImage ? [school.coverImage] : [])
  const initials = school?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'SC'
  const colors = TYPE_COLORS[school?.type ?? ''] ?? TYPE_COLORS.PRIMARY
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isUniversity = school?.type === 'UNIVERSITY'

  useEffect(() => {
    getTeacherChartStatsApi().then(setChartStats).catch(() => {})
    getTeacherClassesApi().then((r) => setClasses(r.classes)).catch(() => {}).finally(() => setClassesLoading(false))
    getCurrentTermApi().then(setTerm).catch(() => {})
    getMyTimetableApi().then((r) => {
      const todayName = DAY_ORDER[new Date().getDay()]
      setTodaySlots(r.slots.filter((s) => s.dayOfWeek === todayName).sort((a, b) => a.startTime.localeCompare(b.startTime)))
    }).catch(() => {}).finally(() => setTimetableLoading(false))
  }, [])

  const daysLeft = term ? Math.max(0, Math.ceil((new Date(term.endDate).getTime() - now.getTime()) / 86400000)) : null

  const deptColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of classes) {
      const key = c.departmentName ?? c.classLevelName
      if (!map.has(key)) map.set(key, DEPT_PALETTE[map.size % DEPT_PALETTE.length])
    }
    return map
  }, [classes])
  const deptColor = (key: string) => deptColorMap.get(key) ?? DEPT_PALETTE[0]

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

      {/* School Year / Your Classes / Calendar — mirrors what a teacher lands on first */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* School Year + Current Period */}
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('School Year')}</p>
                <p className="text-base font-bold text-foreground truncate">{activeSession || t('Not set')}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CalendarClock size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('Current Period')}</p>
                <p className="text-base font-bold text-foreground truncate">{term?.name ?? t('Not set')}</p>
                {daysLeft !== null && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t('Ends in')}: {daysLeft} {t(daysLeft === 1 ? 'day' : 'days')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Your Classes */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground">{t('Your Classes')}</h3>
            <button onClick={() => router.push('/report-cards')} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              {t('View All')} <ArrowRight size={12} />
            </button>
          </div>
          {classesLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("You haven't been assigned any classes yet.")}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {classes.map((c) => {
                const color = deptColor(c.departmentName ?? c.classLevelName)
                const subtitle = [c.departmentName, c.classLevelName].filter(Boolean).join(' · ')
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push('/report-cards')}
                    className="w-full flex items-center gap-3 rounded-lg pl-3 pr-2 py-2.5 border-l-4 bg-muted/40 hover:bg-muted transition text-left"
                    style={{ borderColor: color }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{c.subjectName ?? t('Class Oversight')}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Calendar + Today's Lessons */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground">{monthLabel}</h3>
            <button onClick={() => router.push('/my-timetable')} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              {t('View Timetable')} <ArrowRight size={12} />
            </button>
          </div>
          <MonthCalendar today={now} />
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("Today's Lessons")}</p>
            {timetableLoading ? (
              <div className="h-10 bg-muted rounded-lg animate-pulse" />
            ) : todaySlots.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <CalendarDays size={22} className="text-muted-foreground/50 mb-1.5" />
                <p className="text-xs text-muted-foreground">{t('No lessons scheduled for today')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySlots.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 text-xs">
                    <Clock size={13} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground flex-shrink-0">{s.startTime}</span>
                    <span className="text-foreground font-medium truncate">
                      {s.subjectId ? (s.subjectName ?? t('Unknown subject')) : (s.label ?? t('Private class'))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              cfg={{ key: 'reportCards', label: isUniversity ? 'My Courses' : 'My Subjects', color: '#ea580c', type: 'bar', icon: BookOpen, statKey: 'reportCards' }}
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
        {isClassMaster ? t('Manage Remarks') : t('Enter My Classes')}
        <ArrowRight size={18} className="ml-auto opacity-70" />
      </button>
    </div>
  )
}
