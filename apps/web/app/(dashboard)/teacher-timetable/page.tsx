'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherTimetableApi, getPeriodsApi, getTimetableHistoryApi, TimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getTeacherAbsencesApi, markAbsencesSeenApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
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

  // Landing on this page IS the genuine review — a real navigation, not a background
  // refresh — so it's the one place here that calls markAbsencesSeenApi. The realtime
  // listener below deliberately does NOT: it exists to keep the data current if this tab is
  // left open in the background while something changes elsewhere, and a background sync
  // must never count as an admin having looked at anything.
  useEffect(() => {
    if (!teacherId || !isAdmin) { setLoading(false); return }
    Promise.all([getTeacherTimetableApi(teacherId), getPeriodsApi(), getTeacherAbsencesApi(teacherId)])
      .then(([s, p, a]) => { setSlots(s.slots); setPeriods(p.periods); setAbsences(a.absences) })
      .catch(() => { /* keep last-known data on transient failure */ })
      .finally(() => setLoading(false))
    markAbsencesSeenApi(teacherId).catch(() => {})
  }, [teacherId, isAdmin])

  // Keeps this in step when the absence is deleted or locked from anywhere else. Data-only —
  // deliberately does NOT call markAbsencesSeenApi (see above).
  useEffect(() => onRealtime('absences:changed', () => {
    if (!teacherId || !isAdmin) return
    getTeacherAbsencesApi(teacherId).then((a) => setAbsences(a.absences)).catch(() => {})
  }), [teacherId, isAdmin])

  // The teacher being viewed had their timetable rearranged — possibly by another admin in
  // another tab. Refetch the grid, not just its absence markers.
  useEffect(() => onRealtime('timetable:changed', () => {
    if (!teacherId || !isAdmin) return
    getTeacherTimetableApi(teacherId).then((s) => setSlots(s.slots)).catch(() => {})
  }), [teacherId, isAdmin])

  // ── Archived period: fall back to the version that still holds it ──────────────────
  //
  // An absence outlives the timetable it was reported against (archiving, not deleting, is
  // exactly why the row survives a re-save), so following one can land on a slot the current
  // week no longer contains. Rather than a dead end, load the archived version holding it and
  // show THAT week, absence ringed as usual.
  //
  // Admin-only by construction: `GET /timetable/history` is restricted to SCHOOL_ADMIN /
  // VICE_PRINCIPAL, and this page already refuses anyone else. A teacher following the same
  // link on /my-timetable keeps the plain "no longer on this timetable" banner.
  const missedSlotId = missedInfo.missedSlotId
  const slotArchived = !!missedSlotId && !loading && !slots.some((s) => s.id === missedSlotId)
    // A retraction deleted the absence and a reassignment moved the courses away; in neither
    // case is there anything to go back and look at.
    && missedInfo.missedRetracted !== '1' && !missedInfo.reassignedCourses

  const [pastSlots, setPastSlots] = useState<{ archivedAt: string; slots: TimetableSlot[] } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  // Lets the admin flip back to the schedule in force now, and back again.
  const [showCurrent, setShowCurrent] = useState(false)

  useEffect(() => {
    if (!slotArchived || !teacherId || !isAdmin) { setPastSlots(null); return }
    let cancelled = false
    setHistoryLoading(true)
    getTimetableHistoryApi(teacherId)
      .then(({ versions }) => {
        if (cancelled) return
        // A slot id belongs to exactly one version: every save recreates its rows, so there
        // is never a choice to make about which past week to open.
        const v = versions.find((ver) => ver.slots.some((s) => s.id === missedSlotId))
        setPastSlots(v ? { archivedAt: v.archivedAt, slots: v.slots } : null)
      })
      // Purged from history, or the fetch failed: the plain "gone" banner still applies.
      .catch(() => { if (!cancelled) setPastSlots(null) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [slotArchived, teacherId, isAdmin, missedSlotId])

  const viewingPast = !!pastSlots && !showCurrent
  const displaySlots = viewingPast ? pastSlots!.slots : slots

  // Shared with the teacher's own timetable so the two renderings of "this period was
  // reported absent" cannot drift apart. See lib/timetableGrid.
  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots: WeekGridSlot[] = buildGridSlots(displaySlots, absencesBySlot, {
    t, unknownSubject: t('Unknown subject'),
    // Ring the period this page was opened for, so an absence click lands ON it.
    focusSlotId: missedInfo.missedSlotId,
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
          <MissedPeriodBanner {...missedInfo}
            // Archived by a later save AND that version is gone too (purged, or still
            // loading): the grid has nothing to ring, so say so rather than leaving the
            // click looking broken. Suppressed while the lookup is in flight so the
            // dead-end wording doesn't flash before the past version arrives.
            slotGone={slotArchived && !pastSlots && !historyLoading}
            pastVersion={pastSlots ? {
              archivedAt: pastSlots.archivedAt,
              showing: viewingPast,
              onToggle: () => setShowCurrent((c) => !c),
            } : null} />
          {displaySlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('This teacher has no timetable set up yet.')}</p>
          ) : (
            /* Breaks come from the CURRENT period structure even when an old week is on
               screen: periods aren't versioned, so this is the only structure there is. */
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
