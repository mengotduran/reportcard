import { MyTimetableSlot } from '@/lib/api/timetable'
import { TeacherAbsence } from '@/lib/api/teacherAbsence'
import { WeekGridSlot } from '@/components/WeekGrid'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-08-04" -> "4 Aug". Sliced rather than parsed as a Date, which would shift the day
 *  across a timezone. Shared with the missed-period banner so both read the same. */
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTH_SHORT[Number(d.slice(5, 7)) - 1]}`

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

/** "2026-08-04" -> "TUESDAY", without a Date round-trip (which would shift the day). */
export function dayOfWeekForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/**
 * Does this slot actually run on `dateStr`?
 *
 * Mirrors slotRunsOn in apps/api/src/utils/teachingHours.ts and MUST stay in step with it:
 * the server decides what can be reported, and a client offering a date the server will
 * reject is worse than not offering it at all.
 *
 * A school period recurs weekly forever. A private class may instead be a single day
 * (specificDate) or time-boxed (startsOn/endsOn) — without this a one-off Saturday tutorial
 * was offered on every Saturday of the term.
 */
export function slotRunsOn(
  slot: { dayOfWeek: string; specificDate?: string | null; startsOn?: string | null; endsOn?: string | null },
  dateStr: string,
): boolean {
  if (slot.specificDate) return slot.specificDate === dateStr
  if (slot.dayOfWeek !== dayOfWeekForDate(dateStr)) return false
  if (slot.startsOn && dateStr < slot.startsOn) return false
  if (slot.endsOn && dateStr > slot.endsOn) return false
  return true
}

/** What to call a slot in a picker or a list. A private class has only its label. */
export function slotTitle(slot: { subjectName?: string | null; label?: string | null }): string {
  return slot.subjectName ?? slot.label ?? 'Private class'
}

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
  opts: { t: (s: string) => string; unknownSubject: string; focusSlotId?: string | null },
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
      // A private class shows its room and, when it only runs once, that date — otherwise a
      // one-off is indistinguishable from a permanent weekly fixture on the grid.
      // A private class tied to a course reads like a course tile: its label on top, the
      // course it serves underneath. Unlinked ones fall back to room/date as before.
      subtitle: s.subjectId
        ? s.classLevel
        : [s.privateSubjectName, s.room, s.specificDate ? shortDate(s.specificDate) : null]
            .filter(Boolean).join(' · ') || null,
      isPrivate: !s.subjectId,
      focused: !!opts.focusSlotId && s.id === opts.focusSlotId,
      isOneOff: !!s.specificDate,
      reportedAbsent: upcoming.length > 0,
      note,
      // Purely data-driven. This used to also mark whatever slot the route param named,
      // which meant a deleted absence still showed up struck through, and a FUTURE absence
      // you arrived at was styled as already missed.
      missed: upcoming.length === 0 && past.length > 0,
    }
  })
}
