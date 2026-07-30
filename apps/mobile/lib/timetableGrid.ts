import { MyTimetableSlot } from '@/lib/api/timetable'
import { TeacherAbsence } from '@/lib/api/teacherAbsence'
import { WeekGridSlot } from '@/components/WeekGrid'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-08-04" -> "4 Aug". Sliced rather than parsed as a Date, which would shift the day
 *  across a timezone. Shared with the missed-period banner so both read the same. */
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTH_SHORT[Number(d.slice(5, 7)) - 1]}`

/** Absences keyed by the slot they were reported against. */
export function groupAbsencesBySlot(absences: TeacherAbsence[]): Map<string, TeacherAbsence[]> {
  const bySlot = new Map<string, TeacherAbsence[]>()
  for (const a of absences) {
    const list = bySlot.get(a.timetableSlotId)
    if (list) list.push(a)
    else bySlot.set(a.timetableSlotId, [a])
  }
  return bySlot
}

/**
 * Timetable slots dressed for the week grid, with any reported absence marked on them.
 *
 * The grid is a RECURRING week and carries no dates of its own, so an absence can only be
 * shown against its slot, with the dates spelled out in the note. Shared by the teacher's
 * own timetable and the admin's read-only view of someone else's, so the two can't drift.
 */
export function buildGridSlots(
  slots: MyTimetableSlot[],
  absencesBySlot: Map<string, TeacherAbsence[]>,
  opts: { t: (s: string) => string; unknownSubject: string },
): WeekGridSlot[] {
  const { t } = opts
  return slots.map((s) => {
    const slotAbsences = absencesBySlot.get(s.id) ?? []
    // An upcoming report is the actionable one, so it wins over an older lost period on
    // the same recurring slot.
    const upcoming = slotAbsences.filter((a) => !a.isFinal)
    const past = slotAbsences.filter((a) => a.isFinal)
    const shown = upcoming.length > 0 ? upcoming : past
    const dates = [...new Set(shown.map((a) => a.date))]
    const note = shown.length === 0
      ? null
      : `${upcoming.length > 0 ? t('Absent') : t('Missed')} ${dates.slice(0, 2).map(shortDate).join(', ')}${dates.length > 2 ? '…' : ''}`
    return {
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.subjectId ? (s.subjectName ?? opts.unknownSubject) : (s.label ?? ''),
      subtitle: s.subjectId ? s.classLevel : (s.room ?? null),
      isPrivate: !s.subjectId,
      reportedAbsent: upcoming.length > 0,
      note,
      // Purely data-driven. This used to also mark whatever slot the route param named,
      // which meant a deleted absence still showed up struck through, and a FUTURE absence
      // you arrived at was styled as already missed.
      missed: upcoming.length === 0 && past.length > 0,
    }
  })
}
