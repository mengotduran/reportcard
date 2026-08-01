'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getMyTimetableApi, getPeriodsApi, TimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getMyAbsencesApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { X } from 'lucide-react'
import WeekGrid, { WeekGridSlot } from '@/components/ui/WeekGrid'
import MissedPeriodBanner, { missedInfoFromParams } from '@/components/ui/MissedPeriodBanner'
import { buildGridSlots, groupAbsencesBySlot } from '@/lib/timetableGrid'
import { onRealtime } from '@/lib/socket'
import { shortDate } from '@/lib/timetableGrid'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { stripProgrammeSuffix } from '@/lib/programme'

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

function MyTimetableView() {
  const tr = useT()
  const searchParams = useSearchParams()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  // Absences for the current record, so a slot already reported shows as such on the grid
  // itself rather than only in the Attendance list.
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null)
  const [failed, setFailed] = useState(false)

  // Set when this page was opened from a notification about one of the viewer's own
  // absences, e.g. an admin logging or removing one on their behalf.
  const missedInfo = missedInfoFromParams(searchParams)

  useBodyScrollLock(!!selectedSlot)

  const loadAbsences = () => {
    getMyAbsencesApi().then((a) => setAbsences(a.absences)).catch(() => { /* grid still renders */ })
  }

  // The grid marks the affected period, so a stale list means a period still drawn as absent
  // after an admin cleared it. Only the absences are refetched: the timetable itself did not
  // change.
  useEffect(() => onRealtime('absences:changed', loadAbsences), [])

  // An admin rearranged this timetable. Unlike absences:changed above, the SLOTS themselves
  // moved, so refetching only the decorations would leave the old grid on screen.
  useEffect(() => onRealtime('timetable:changed', () => {
    getMyTimetableApi().then((s) => setSlots(s.slots)).catch(() => { /* keep the last grid */ })
    loadAbsences()
  }), [])

  useEffect(() => {
    // Deliberately NOT one Promise.all: absences are a decoration on the grid, so a failure
    // there must not blank the timetable itself. Bundling them would make any absence error
    // look exactly like "your admin hasn't built your timetable", which is a different and
    // much more alarming message.
    Promise.all([getMyTimetableApi(), getPeriodsApi()])
      .then(([s, p]) => { setSlots(s.slots); setPeriods(p.periods); setFailed(false) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
    loadAbsences()
  }, [])

  const breakPeriods = periods.filter((p) => p.isBreak)

  // Admin hasn't built this teacher's timetable yet — still show the same
  // empty grid frame, not an error/empty-state message, matching what an
  // admin sees before they've added anything.
  // Shared with the admin's read-only view of another teacher, so the two renderings of
  // "this period was reported absent" cannot drift apart. See lib/timetableGrid.
  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots: WeekGridSlot[] = buildGridSlots(slots, absencesBySlot, {
    t: tr, unknownSubject: tr('Unknown subject'),
    // Ring the period this page was opened for, so an absence click lands ON it.
    focusSlotId: missedInfo.missedSlotId,
  })

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-foreground">{tr('My Timetable')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{tr('Your weekly schedule')}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
      ) : (
        <>
          {slots.length > 0 && (
            <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/30 inline-block" /> {tr(isUniversity ? 'Course' : 'Subject')}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> {tr('Private class')}</span>
              {absences.length > 0 && (
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-dashed border-slate-300 inline-block" /> {tr('Reported absent')}</span>
              )}
              <span>{tr('Click a slot for details')}</span>
            </div>
          )}
          {slots.length === 0 && (
            <p className={`text-sm mb-3 ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
              {failed
                ? tr('Could not load your timetable. Check your connection and reload.')
                : tr("Your timetable hasn't been set up yet — check back once your admin has built it.")}
            </p>
          )}
          <MissedPeriodBanner {...missedInfo}
            // Archived by a later save: the grid has nothing to ring, so say so
            // rather than leaving the click looking broken.
            slotGone={!!missedInfo.missedSlotId && !loading && !slots.some((s) => s.id === missedInfo.missedSlotId)} />
          <WeekGrid
            slots={gridSlots}
            breaks={breakPeriods}
            onSlotClick={(s) => setSelectedSlot(slots.find((x) => x.id === s.id) ?? null)}
          />
        </>
      )}

      {selectedSlot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSlot(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-lg">
                {selectedSlot.subjectId ? (selectedSlot.subjectName ?? tr('Unknown subject')) : (selectedSlot.label ?? tr('Private class'))}
              </h3>
              <button onClick={() => setSelectedSlot(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-2 text-sm">
              {/* A one-off names its date instead of a weekday — a private class that runs
                  once is not a "every Monday" fixture and must not read as one. */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{selectedSlot.specificDate ? tr('Date') : tr('Day')}</span>
                <span className="text-foreground font-medium">
                  {selectedSlot.specificDate ? shortDate(selectedSlot.specificDate) : tr(dayLabel(selectedSlot.dayOfWeek))}
                </span>
              </div>
              {/* Time-boxed private class: without this a six-week revision class looks
                  identical to a permanent one. Matches the mobile detail sheet. */}
              {!selectedSlot.specificDate && (selectedSlot.startsOn || selectedSlot.endsOn) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tr('Runs')}</span>
                  <span className="text-foreground font-medium">
                    {selectedSlot.startsOn && selectedSlot.endsOn
                      ? `${shortDate(selectedSlot.startsOn)} → ${shortDate(selectedSlot.endsOn)}`
                      : selectedSlot.startsOn
                        ? `${tr('From')} ${shortDate(selectedSlot.startsOn)}`
                        : `${tr('Until')} ${shortDate(selectedSlot.endsOn!)}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr('Time')}</span>
                <span className="text-foreground font-medium">{selectedSlot.startTime} – {selectedSlot.endTime}</span>
              </div>
              {selectedSlot.subjectId && (
                <div>
                  <span className="block text-muted-foreground">{tr(isUniversity ? 'Course' : 'Subject')}</span>
                  <span className="block text-foreground font-medium break-words">{selectedSlot.subjectName ?? tr('Unknown subject')}</span>
                </div>
              )}
              {selectedSlot.subjectId && selectedSlot.classLevel && (
                <div>
                  <span className="block text-muted-foreground">{tr('Class')}</span>
                  <span className="block text-foreground font-medium break-words">{stripProgrammeSuffix(selectedSlot.classLevel)}</span>
                </div>
              )}
              {/* Which course this private class delivers hours toward. Rendered nowhere
                  before, so a linked class looked identical to a standalone one. */}
              {!selectedSlot.subjectId && selectedSlot.privateSubjectName && (
                <div>
                  <span className="block text-muted-foreground">{tr('Counts toward')}</span>
                  <span className="block text-foreground font-medium break-words">{selectedSlot.privateSubjectName}</span>
                </div>
              )}
              {!selectedSlot.subjectId && selectedSlot.privateSubjectClass && (
                <div>
                  <span className="block text-muted-foreground">{tr('Class')}</span>
                  <span className="block text-foreground font-medium break-words">{stripProgrammeSuffix(selectedSlot.privateSubjectClass)}</span>
                </div>
              )}
              {selectedSlot.room && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tr('Room')}</span>
                  <span className="text-foreground font-medium">{selectedSlot.room}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MyTimetablePage() {
  return (
    <Suspense fallback={null}>
      <MyTimetableView />
    </Suspense>
  )
}
