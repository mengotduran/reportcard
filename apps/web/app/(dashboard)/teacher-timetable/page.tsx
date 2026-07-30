'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherTimetableApi, getPeriodsApi, TimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getTeacherAbsencesApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import WeekGrid, { WeekGridSlot } from '@/components/ui/WeekGrid'
import MissedPeriodBanner, { missedInfoFromParams } from '@/components/ui/MissedPeriodBanner'
import { buildGridSlots, groupAbsencesBySlot } from '@/lib/timetableGrid'
import { onRealtime } from '@/lib/socket'

/**
 * A teacher's timetable as an ADMIN sees it, read-only, opened from one of their reported
 * absences or from a notification about one.
 *
 * Deliberately not the /timetable builder, which is an editing surface: an admin following
 * up on an absence wants to see the week, not risk changing it. Deliberately not a nav item
 * either, since it only makes sense with a teacher in the query string.
 *
 * Twin of apps/mobile/app/teacher-timetable.tsx.
 */
function TeacherTimetableView() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'SCHOOL_ADMIN' || user?.role === 'VICE_PRINCIPAL'

  const teacherId = searchParams.get('teacherId') ?? ''
  const teacherName = searchParams.get('teacherName') ?? ''
  const missedInfo = missedInfoFromParams(searchParams)

  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teacherId || !isAdmin) { setLoading(false); return }
    Promise.all([getTeacherTimetableApi(teacherId), getPeriodsApi(), getTeacherAbsencesApi(teacherId)])
      .then(([s, p, a]) => { setSlots(s.slots); setPeriods(p.periods); setAbsences(a.absences) })
      .catch(() => { /* keep last-known data on transient failure */ })
      .finally(() => setLoading(false))
  }, [teacherId, isAdmin])

  // Keeps this in step when the absence is deleted or locked from anywhere else.
  useEffect(() => onRealtime('absences:changed', () => {
    if (!teacherId || !isAdmin) return
    getTeacherAbsencesApi(teacherId).then((a) => setAbsences(a.absences)).catch(() => {})
  }), [teacherId, isAdmin])

  // Shared with the teacher's own timetable so the two renderings of "this period was
  // reported absent" cannot drift apart. See lib/timetableGrid.
  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots: WeekGridSlot[] = buildGridSlots(slots, absencesBySlot, {
    t, unknownSubject: t('Unknown subject'),
  })

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground py-12 text-center">{t('You do not have permission to perform this action')}</p>
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={15} /> {t('Back')}
      </button>

      <div className="mb-5">
        <h2 className="text-2xl font-bold text-foreground">{teacherName || t('Timetable')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Weekly schedule, read only')}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : (
        <>
          <MissedPeriodBanner {...missedInfo} />
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('This teacher has no timetable set up yet.')}</p>
          ) : (
            <WeekGrid slots={gridSlots} breaks={periods.filter((p) => p.isBreak)} />
          )}
        </>
      )}
    </div>
  )
}

export default function TeacherTimetablePage() {
  return (
    <Suspense fallback={null}>
      <TeacherTimetableView />
    </Suspense>
  )
}
