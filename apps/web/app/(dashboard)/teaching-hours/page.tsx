'use client'
import { useEffect, useState, Fragment} from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { getCoverageApi, getTeacherHoursTotalsApi, CoverageRow, CoverageStatus, TeacherHoursTotal, UnassignedTarget } from '@/lib/api/coverage'
import { getTeacherAbsencesApi, getAbsenceCountsApi, reportAbsenceApi, deleteAbsenceApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { getTeachersApi } from '@/lib/api/teachers'
import { getTeacherTimetableApi, TimetableSlot } from '@/lib/api/timetable'
import { formatHours } from '@/lib/formatHours'
import CustomSelect from '@/components/ui/CustomSelect'
import Pagination from '@/components/ui/Pagination'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/lib/useToast'
import { onRealtime } from '@/lib/socket'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { usePagination } from '@/lib/usePagination'
import { Clock, CalendarOff, Search, X, Trash2, Users, ChevronRight} from 'lucide-react'

interface DrillTarget {
  teacherId: string
  teacherName: string
  // null = show every absence for this teacher, not scoped to one course (the "By
  // Teacher" view) — set when opened from the per-course table (the "By Course" view).
  subjectName: string | null
  classLevel: string | null
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// Same Monday-first mapping used on the teacher's own Report Absence flow
// (my-teaching-hours/page.tsx) — kept local for the same reason: a one-liner,
// not worth a shared util.
function dayOfWeekFor(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return ['SUNDAY', ...DAY_ORDER.slice(0, 6)][jsDay]
}

const STATUS_STYLE: Record<CoverageStatus, string> = {
  NO_TARGET: 'bg-muted text-muted-foreground',
  UNDER: 'bg-destructive/10 text-destructive',
  EXACT: 'bg-green-100 text-green-700',
  OVER: 'bg-amber-100 text-amber-700',
}

const STATUS_FILTERS: { value: CoverageStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNDER', label: 'Under' },
  { value: 'EXACT', label: 'Exact' },
  { value: 'OVER', label: 'Over' },
  { value: 'NO_TARGET', label: 'No target' },
]

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

// Mirrors the API's slotHasPassed (Cameroon is UTC+1/WAT, no DST) — lets the UI grey
// elapsed periods out up front instead of only finding out after a rejected request.
// Same helper the teacher's own page uses; kept local for the same reason (a one-liner).
function slotHasPassed(dateStr: string, endTime: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = endTime.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh - 1, mm || 0) <= Date.now()
}

/** Today in the school's local time (WAT), as YYYY-MM-DD — the earliest date an absence
 *  can still be reported for, since anything before it has entirely elapsed. */
function todayInSchoolTime(): string {
  const now = new Date()
  const wat = new Date(now.getTime() + 60 * 60 * 1000) // UTC+1
  return wat.toISOString().slice(0, 10)
}

export default function TeachingHoursPage() {
  const t = useT()
  const { school } = useAuthStore()
  // Only used to word the "period was lost" warning; the API is the real gate.
  const graceMinutes = school?.absenceGraceMinutes ?? null
  const isUniversity = school?.type === 'UNIVERSITY'
  const { toast, showToast, hideToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<string | null>(null)
  const [rows, setRows] = useState<CoverageRow[]>([])
  // Courses with an hours target but no lecturer — they produce no coverage row at all,
  // so without naming them the empty state blames the wrong thing.
  const [unassignedTargets, setUnassignedTargets] = useState<UnassignedTarget[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CoverageStatus | 'ALL'>('ALL')

  // By Course (existing coverage table, only courses with an hours target) vs By Teacher
  // (every teacher, every absence — a course with no target set is otherwise invisible).
  // Defaults to By Teacher, not By Course. A coverage row only exists for a course with a
  // required-hours target, so By Course structurally CANNOT show an absence on any untargeted
  // course — a school with 43 teachers and one target showed an admin a near-empty table
  // while the teacher's own screen listed four absences. "Who has been absent" is what this
  // page is opened for; hours-coverage tracking is one click away under By Course.
  const [viewMode, setViewMode] = useState<'course' | 'teacher'>('teacher')
  const [teacherSearch, setTeacherSearch] = useState('')
  // Value stored is PERIODS missed per teacher. periodMinutes null = school hasn't set a
  // period length, so the numbers are event counts and we label them "absences" instead.
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number>>({})
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  const [hoursTotals, setHoursTotals] = useState<Record<string, TeacherHoursTotal>>({})
  // "2 periods" vs "2 absences" — depends on whether a period length is configured.
  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period') : t('periods')) : (n === 1 ? t('absence') : t('absences'))

  const [drillDown, setDrillDown] = useState<DrillTarget | null>(null)
  // Which course row is open. One at a time: the breakdown is for answering "who taught
  // this", not for scanning every course at once.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAllTeachers, setShowAllTeachers] = useState(false)
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [absencesLoading, setAbsencesLoading] = useState(false)

  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportTeacherId, setReportTeacherId] = useState('')
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useBodyScrollLock(showReportModal)

  const load = () => {
    setLoading(true)
    getCoverageApi().then((d) => { setSession(d.session); setRows(d.rows); setUnassignedTargets(d.unassignedTargets ?? []) }).finally(() => setLoading(false))
  }

  useEffect(load, [])
  // Not a silent catch: if this fails the By Teacher view has nothing to list and would
  // otherwise say "No teachers found", blaming the data for a network problem.
  const [teachersFailed, setTeachersFailed] = useState(false)
  useEffect(() => {
    getTeachersApi()
      .then((d) => { setTeachers(d.teachers); setTeachersFailed(false) })
      .catch(() => setTeachersFailed(true))
  }, [])
  const refreshCounts = () => {
    getAbsenceCountsApi()
      .then((d) => { setAbsenceCounts(Object.fromEntries(d.counts.map((c) => [c.teacherId, c.periods]))); setPeriodMinutes(d.periodMinutes) })
      .catch(() => {})
  }
  useEffect(refreshCounts, [])
  // A teacher anywhere in the school reporting or retracting changes both the coverage rows
  // and the per-teacher counts shown here.
  useEffect(() => onRealtime('absences:changed', () => { load(); refreshCounts() }), [])
  useEffect(() => {
    getTeacherHoursTotalsApi()
      .then((d) => setHoursTotals(Object.fromEntries(d.totals.map((t) => [t.teacherId, t]))))
      .catch(() => {})
  }, [])

  const openReportModal = () => {
    setReportTeacherId('')
    setTeacherSlots([])
    setDate('')
    setWholeDay(true)
    setSelectedSlotIds([])
    setShowReportModal(true)
  }

  useEffect(() => {
    if (!reportTeacherId) { setTeacherSlots([]); return }
    setSlotsLoading(true)
    getTeacherTimetableApi(reportTeacherId).then((d) => setTeacherSlots(d.slots)).finally(() => setSlotsLoading(false))
  }, [reportTeacherId])

  const daySlots = date ? teacherSlots.filter((s) => s.dayOfWeek === dayOfWeekFor(date) && s.subjectId) : []
  // An absence can only be reported for a period that hasn't ENDED yet — admins are no
  // longer exempt from that (the API enforces it either way).
  const reportableSlots = daySlots.filter((s) => !slotHasPassed(date, s.endTime))

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportTeacherId || !date) return
    setSaving(true)
    try {
      await reportAbsenceApi({ teacherId: reportTeacherId, date, wholeDay, timetableSlotIds: wholeDay ? undefined : selectedSlotIds })
      setShowReportModal(false)
      showToast(t('Absence recorded'))
      load()
      if (drillDown && drillDown.teacherId === reportTeacherId) {
        // Refresh whichever drill-down was open — course-scoped or the full teacher list.
        if (drillDown.subjectName) {
          const row = rows.find((r) => r.subjectName === drillDown.subjectName && r.classLevel === drillDown.classLevel
            && r.contributors.some((c) => c.teacherId === drillDown.teacherId))
          const contributor = row?.contributors.find((c) => c.teacherId === drillDown.teacherId)
          if (row && contributor) openDrillDown(row, contributor)
        } else {
          openTeacherDrillDown(drillDown.teacherId, drillDown.teacherName)
        }
      }
      refreshCounts()
    } catch (err: any) {
      showToast(err.response?.data?.message || t('Failed to record absence'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.subjectName.toLowerCase().includes(q) || r.classLevel.toLowerCase().includes(q)
      || r.contributors.some((c) => c.teacherName.toLowerCase().includes(q))
  })

  const { page, setPage, pageItems, totalPages } = usePagination(filtered, 15, `${search}|${statusFilter}`)

  // A course row has no single teacher, so drilling in is done per contributor — absences
  // belong to a person, not to a course.
  const openDrillDown = (row: CoverageRow, c: { teacherId: string; teacherName: string }) => {
    setDrillDown({ teacherId: c.teacherId, teacherName: c.teacherName, subjectName: row.subjectName, classLevel: row.classLevel })
    setAbsencesLoading(true)
    getTeacherAbsencesApi(c.teacherId)
      .then((d) => setAbsences(d.absences.filter((a) => a.subjectName === row.subjectName && a.classLevel === row.classLevel)))
      .finally(() => setAbsencesLoading(false))
  }

  // "By Teacher" — every absence for this teacher, any course, targeted or not.
  const openTeacherDrillDown = (teacherId: string, teacherName: string) => {
    setDrillDown({ teacherId, teacherName, subjectName: null, classLevel: null })
    setAbsencesLoading(true)
    getTeacherAbsencesApi(teacherId)
      .then((d) => setAbsences(d.absences))
      .finally(() => setAbsencesLoading(false))
  }

  // Default hides the teachers with nothing recorded. A school with 43 staff and two
  // absences was a wall of empty cards to scan; the page is opened to find who HAS been
  // absent. Searching by name always looks at everyone, or the search would appear broken.
  const teacherRows = teachers
    .map((tch) => ({ ...tch, count: absenceCounts[tch.id] ?? 0 }))
    .filter((tch) => teacherSearch.trim() || showAllTeachers || tch.count > 0)
    .filter((tch) => !teacherSearch.trim() || tch.name.toLowerCase().includes(teacherSearch.toLowerCase()))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const hiddenTeacherCount = teachers.filter((tch) => (absenceCounts[tch.id] ?? 0) === 0).length

  // 4 teachers per row, paginated once there are more than 7 rows' worth (28 teachers).
  const TEACHER_COLS = 4
  const TEACHER_ROWS_PER_PAGE = 7
  const { page: teacherPage, setPage: setTeacherPage, pageItems: teacherPageItems, totalPages: teacherTotalPages } =
    usePagination(teacherRows, TEACHER_COLS * TEACHER_ROWS_PER_PAGE, teacherSearch)

  // Deleting after the arrival window has closed means overriding a period the school
  // counts as lost, so it is confirmed rather than done on one click. Before the window
  // closes there is nothing to override and it stays a single click.
  const [confirmLost, setConfirmLost] = useState<TeacherAbsence | null>(null)

  const handleDeleteAbsence = async (id: string, graceExpired = false) => {
    if (graceExpired) {
      const target = absences.find((a) => a.id === id)
      if (target) { setConfirmLost(target); return }
    }
    try {
      await deleteAbsenceApi(id)
      setAbsences((prev) => prev.filter((a) => a.id !== id))
      showToast(t('Absence removed'))
      // The hour this absence was subtracting goes straight back into taughtHours/
      // projectedFinalHours server-side (computed fresh every fetch, nothing cached) —
      // refetch here so that's visible immediately rather than only on next page load.
      load()
      refreshCounts()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || t('Failed to remove absence'), 'error')
      // Could simply be a stale list: the period may have ended while it sat open.
      load()
    } finally {
      setConfirmLost(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Attendance')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {session
              ? `${t('Hours coverage for')} ${session}`
              : t('No academic session found yet.')}
          </p>
        </div>
        <button
          onClick={openReportModal}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition whitespace-nowrap"
        >
          <CalendarOff size={16} /> {t('Report Absence')}
        </button>
      </div>

      {/* By Course = existing coverage table, hours-target tracking, courses without a
          target never appear here. By Teacher = every teacher, every absence, no matter
          what course or whether it has an hours target — a separate concern from hours
          tracking, so it's a distinct view rather than bolted onto the table above. */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode('course')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'course' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('By Course')}
        </button>
        <button
          onClick={() => setViewMode('teacher')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'teacher' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('By Teacher')}
        </button>
      </div>

      {viewMode === 'teacher' ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {isUniversity
              ? t('Counts are for the current semester — once it ends, next semester starts a fresh record.')
              : t('Counts are for the current academic year — once it ends, next year starts a fresh record.')}
          </p>
          {(() => {
            const withAbsences = teacherRows.filter((r) => r.count > 0)
            const totalPeriods = withAbsences.reduce((sum, r) => sum + r.count, 0)
            return (
              <p className="text-sm font-semibold text-foreground mb-3">
                {totalPeriods === 0
                  ? t('No absences recorded yet.')
                  : `${totalPeriods} ${t(totalPeriods === 1 ? 'period missed' : 'periods missed')} · ${withAbsences.length} ${t(withAbsences.length === 1 ? 'teacher' : 'teachers')}`}
              </p>
            )
          })()}
          {hiddenTeacherCount > 0 && !teacherSearch.trim() && (
            <button
              onClick={() => setShowAllTeachers((v) => !v)}
              className="text-xs font-medium text-primary hover:underline mb-3 block"
            >
              {showAllTeachers
                ? t('Hide teachers with no absences')
                : `${t('Show all')} · ${hiddenTeacherCount} ${t('with none')}`}
            </button>
          )}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder={t('Search teacher...')}
              value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {teacherRows.length === 0 ? (
            <div className="bg-card rounded-xl border border-border text-center py-14">
              <Users size={32} className="mx-auto mb-3 text-muted-foreground" />
              <p className={`text-sm ${teachersFailed ? 'text-destructive' : 'text-muted-foreground'}`}>
                {teachersFailed ? t('Could not load teachers. Check your connection and reload.') : t('No teachers found.')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {teacherPageItems.map((tch) => {
                  const totals = hoursTotals[tch.id]
                  return (
                    <button
                      key={tch.id}
                      onClick={() => openTeacherDrillDown(tch.id, tch.name)}
                      className="bg-card border border-border rounded-xl px-4 py-3.5 hover:bg-hover/40 hover:border-primary/30 transition text-left"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{tch.name}</span>
                        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${tch.count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                          {tch.count}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{unit(tch.count)}</p>
                      {totals && totals.scheduledHours > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatHours(totals.taughtHours)} {t('hours taught')}{!totals.isFinal && ` (${t('so far')})`}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3">
                <Pagination page={teacherPage} totalPages={teacherTotalPages} total={teacherRows.length} pageSize={TEACHER_COLS * TEACHER_ROWS_PER_PAGE} onPage={setTeacherPage} />
              </div>
            </>
          )}
        </>
      ) : loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-14 px-6">
          <Clock size={32} className="mx-auto mb-3 text-muted-foreground" />
          {unassignedTargets.length > 0 ? (
            <>
              <p className="text-foreground text-sm font-medium">
                {unassignedTargets.length === 1
                  ? t('One course has an hours target but no lecturer assigned.')
                  : `${unassignedTargets.length} ${t('courses have an hours target but no lecturer assigned.')}`}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {t('Hours are counted against the lecturer who teaches the course, so assign one from the Courses page and it will appear here.')}
              </p>
              <ul className="text-muted-foreground text-xs mt-3 space-y-0.5">
                {unassignedTargets.slice(0, 6).map((u) => (
                  <li key={`${u.classLevel}-${u.name}`}>{u.name} · {u.classLevel}</li>
                ))}
                {unassignedTargets.length > 6 && <li>+{unassignedTargets.length - 6}</li>}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t('No subjects have a required-hours target set yet. Set one from the Subjects page.')}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" placeholder={t('Search teacher, subject or class...')}
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="w-full sm:w-48">
              <CustomSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as CoverageStatus | 'ALL')}
                options={STATUS_FILTERS.map((f) => ({ value: f.value, label: t(f.label) }))}
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Teacher')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isUniversity ? t('Course') : t('Subject')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Required')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Taught so far')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Projected / Final')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((r) => (
                  <Fragment key={r.subjectId}>
                  {/* The COURSE is the row: its target is stated once and compared against
                      everything taught on it. Who taught what is one level down, because two
                      teachers sharing a 30-hour course are at 30 between them, not 30 each. */}
                  <tr className="hover:bg-hover/40 transition cursor-pointer" onClick={() => setExpanded(expanded === r.subjectId ? null : r.subjectId)}>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronRight size={14} className={`text-muted-foreground transition-transform ${expanded === r.subjectId ? 'rotate-90' : ''}`} />
                        {r.contributors.length === 1
                          ? r.contributors[0].teacherName
                          : `${r.contributors.length} ${t('teachers')}`}
                      </span>
                      {r.periodsMissed > 0 && (
                        <span className="ml-2 inline-block text-xs font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full" title={`${r.periodsMissed} ${unit(r.periodsMissed)} ${t('missed')}`}>{r.periodsMissed}</span>
                      )}
                      {r.gaps.length > 0 && (
                        <span
                          className={`ml-2 inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full ${r.gaps.some((g) => g.elapsed) ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100'}`}
                          title={r.gaps.map((g) => `${g.startDate} → ${g.endDate}`).join(', ')}
                        >
                          {r.gaps.some((g) => g.elapsed) ? t('no teacher') : t('unstaffed ahead')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{r.subjectName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{r.classLevel}{r.term ? ` · ${r.term}` : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">{r.requiredHours != null ? formatHours(r.requiredHours) : '—'}</td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">{formatHours(r.taughtHours)}</td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">{formatHours(r.projectedFinalHours)}{!r.isFinal && <span className="text-xs text-muted-foreground"> ({t('projected')})</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                        {t(r.status)}
                      </span>
                    </td>
                  </tr>
                  {expanded === r.subjectId && r.contributors.map((c) => (
                    <tr key={c.teacherId} className="bg-muted/30 cursor-pointer hover:bg-hover/40 transition" onClick={() => openDrillDown(r, c)}>
                      <td className="px-5 py-2 pl-11 text-sm text-foreground">
                        {c.teacherName}
                        {c.periodsMissed > 0 && (
                          <span className="ml-2 inline-block text-xs font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">{c.periodsMissed}</span>
                        )}
                      </td>
                      {/* The window they held it — what makes a mid-term handover legible. */}
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {c.startedAt}{c.endedAt ? ` → ${c.endedAt}` : ` → ${t('present')}`}
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-muted-foreground">—</td>
                      <td className="px-4 py-2 text-center text-sm text-foreground">{formatHours(c.taughtHours)}</td>
                      <td className="px-4 py-2 text-center text-sm text-foreground">{formatHours(c.projectedFinalHours)}</td>
                      <td className="px-4 py-2 text-center text-xs text-muted-foreground">{t('click for absences')}</td>
                    </tr>
                  ))}
                  {expanded === r.subjectId && r.gaps.map((g) => (
                    <tr key={`${g.startDate}-${g.endDate}`} className="bg-muted/30">
                      <td className="px-5 py-2 pl-11 text-sm text-muted-foreground italic" colSpan={2}>
                        {g.elapsed ? t('No teacher held this course') : t('No teacher assigned from')} {g.startDate} → {g.endDate}
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-muted-foreground" colSpan={4}>
                        {g.elapsed ? t('these hours were not taught') : t('assign someone before this starts')}
                      </td>
                    </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table></div>
          </div>
          <div className="mt-3">
            <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={15} onPage={setPage} />
          </div>
        </>
      )}

      {drillDown && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDrillDown(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{drillDown.teacherName}</h3>
                <p className="text-xs text-muted-foreground">
                  {drillDown.subjectName ? `${drillDown.subjectName} · ${drillDown.classLevel}` : `${absences.reduce((s, a) => s + (a.periods ?? 1), 0)} ${unit(absences.reduce((s, a) => s + (a.periods ?? 1), 0))} ${t('missed, all courses')}`}
                </p>
              </div>
              <button onClick={() => setDrillDown(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-xs font-medium text-foreground mb-2">{t('Absences logged')}</p>
            {absencesLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('Loading…')}</p>
            ) : absences.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{drillDown.subjectName ? t('No absences reported for this course.') : t('No absences reported for this teacher.')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* seenByAdmin only locks a TEACHER out of retracting their own report —
                    an admin can remove one here regardless, right up until the period it
                    was reported for is FINAL (isFinal: start + the school's grace period) — after that it's
                    final for everyone, since there's no more chance the teacher shows up. */}
                {absences.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</span>
                        {a.periods != null && a.periods > 1 && <span className="text-xs font-semibold text-orange-700">({a.periods} {t('periods')})</span>}
                        {a.seenByAdmin && <span className="text-xs text-muted-foreground italic">({t('reviewed')})</span>}
                      </div>
                      {/* Only shown in the unscoped "By Teacher" view — the "By Course" view
                          already scopes the whole list to one course, so this would be
                          redundant there. */}
                      {!drillDown.subjectName && (a.subjectName || a.classLevel) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{a.subjectName} · {a.classLevel}</p>
                      )}
                    </div>
                    {/* The REASON has to be on screen, not only in a title tooltip: a
                        greyed-out bin with no explanation reads as "admin cannot delete
                        absences", when the actual rule is that this one period is over. */}
                    {a.isFinal && (
                      <span className="text-xs text-muted-foreground italic mr-2 whitespace-nowrap">{t('period over')}</span>
                    )}
                    <button
                      onClick={() => handleDeleteAbsence(a.id, a.graceExpired)}
                      disabled={a.isFinal}
                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                      title={a.isFinal
                        ? t('This period has already ended and can no longer be changed')
                        : a.graceExpired
                          ? t('This period was lost. You can still mark them present, with a warning.')
                          : t('Remove')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{t('Report Absence')}</h3>
              <button onClick={() => setShowReportModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Teacher')} <span className="text-destructive">*</span></label>
                <CustomSelect
                  value={reportTeacherId}
                  onChange={(v) => { setReportTeacherId(v); setDate(''); setSelectedSlotIds([]) }}
                  options={teachers.map((tch) => ({ value: tch.id, label: tch.name }))}
                  placeholder={t('Select teacher…')}
                />
              </div>

              {/* Catches the exact confusion that motivated this: a teacher with NO
                  timetable set up at all silently has nothing to match on ANY date, so
                  the per-date message below was easy to miss and looked like the report
                  just wasn't going through, with no obvious next step. */}
              {reportTeacherId && !slotsLoading && teacherSlots.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  {t('This teacher has no timetable set up yet, so an absence can\'t be recorded for them. Set up their timetable first, then come back here.')}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Date')} <span className="text-destructive">*</span></label>
                <input
                  type="date" required disabled={!reportTeacherId || teacherSlots.length === 0}
                  // A whole past day has, by definition, no period left to report — so
                  // the picker won't offer one rather than accepting it and failing.
                  min={todayInSchoolTime()}
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setSelectedSlotIds([]) }}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>

              {reportTeacherId && date && (
                slotsLoading ? (
                  <p className="text-xs text-muted-foreground">{t('Loading…')}</p>
                ) : daySlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('No periods on this teacher\'s timetable for this day.')}</p>
                ) : reportableSlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('All periods for this day have already passed and can no longer be reported.')}</p>
                ) : (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground mb-3">
                      <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
                      {t('Absent the whole day')}
                    </label>
                    {/* Always visible, not just once "whole day" is unchecked — while it's
                        checked these just reflect that every period is covered (shown
                        checked + disabled) rather than disappearing entirely. Periods that
                        have already ended stay visible but locked, so it's clear they exist
                        and why they can't be picked. */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground mb-1">{t('Which periods?')}</p>
                      {daySlots.map((s) => {
                        const passed = slotHasPassed(date, s.endTime)
                        return (
                          <label key={s.id} className={`flex items-center gap-2 text-sm text-foreground ${wholeDay || passed ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={passed ? false : (wholeDay || selectedSlotIds.includes(s.id))}
                              disabled={wholeDay || passed}
                              onChange={(e) => setSelectedSlotIds(e.target.checked ? [...selectedSlotIds, s.id] : selectedSlotIds.filter((id) => id !== s.id))}
                            />
                            {s.startTime}–{s.endTime} · {s.subjectName} <span className="text-xs text-muted-foreground">{s.classLevel}</span>
                            {passed && <span className="text-xs text-muted-foreground italic">({t('already passed')})</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowReportModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition">
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !reportTeacherId || !date || (!wholeDay && selectedSlotIds.length === 0) || reportableSlots.length === 0}
                  className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                >
                  {saving ? t('Saving…') : t('Report Absence')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Spells out what is being overridden: the period is already counted as lost, and
          deleting the record marks the teacher present for it after the fact. */}
      <ConfirmModal
        isOpen={confirmLost != null}
        title={t('This period was already lost')}
        message={confirmLost
          ? `${confirmLost.subjectName ?? t('This class')} · ${confirmLost.date} ${confirmLost.startTime}–${confirmLost.endTime}. ${
              graceMinutes != null
                ? `${t('The')} ${graceMinutes}${t('-minute window to arrive has passed, so this period counts as missed and not taught.')}`
                : t('The window to arrive has passed, so this period counts as missed and not taught.')
            } ${t('Removing it marks them present for the period anyway. Continue?')}`
          : ''}
        confirmLabel={t('Mark present anyway')}
        confirmColor="red"
        onConfirm={() => { if (confirmLost) handleDeleteAbsence(confirmLost.id) }}
        onCancel={() => setConfirmLost(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
