'use client'
import { useEffect, useState } from 'react'
import { getMyTimetableApi, getPeriodsApi, TimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import WeekGrid, { WeekGridSlot } from '@/components/ui/WeekGrid'

export default function MyTimetablePage() {
  const tr = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])

  useEffect(() => {
    Promise.all([getMyTimetableApi(), getPeriodsApi()])
      .then(([s, p]) => { setSlots(s.slots); setPeriods(p.periods) })
      .finally(() => setLoading(false))
  }, [])

  const breakPeriods = periods.filter((p) => p.isBreak)

  // Admin hasn't built this teacher's timetable yet — still show the same
  // empty grid frame, not an error/empty-state message, matching what an
  // admin sees before they've added anything.
  const gridSlots: WeekGridSlot[] = slots.map((s) => ({
    id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
    title: s.subjectId ? (s.subjectName ?? tr('Unknown subject')) : (s.label ?? ''),
    subtitle: s.subjectId ? s.classLevel : s.room,
    isPrivate: !s.subjectId,
  }))

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
            </div>
          )}
          {slots.length === 0 && (
            <p className="text-sm text-muted-foreground mb-3">{tr("Your timetable hasn't been set up yet — check back once your admin has built it.")}</p>
          )}
          <WeekGrid slots={gridSlots} breaks={breakPeriods} />
        </>
      )}
    </div>
  )
}
