import api from './client'

export interface TeacherAbsence {
  id: string
  teacherId: string
  timetableSlotId: string
  date: string // "YYYY-MM-DD"
  recordedById: string
  dayOfWeek: string
  startTime: string
  endTime: string
  subjectName: string | null
  classLevel: string | null
  /** True once this period can no longer be changed by anyone: its start plus the school's
   *  grace period, or its end when no grace is configured. The API is the real gate on
   *  delete either way, this is just enough for the UI to grey the button out. */
  isFinal: boolean
  /** True once an admin has reviewed this in the per-teacher list on a PRIOR visit — from
   *  then on it's locked for everyone, admin included. See getTeacherAbsences below. */
  seenByAdmin: boolean
  /** Which period of the slot this row is, 0-based. null on a legacy row that still stands
   *  for the whole slot. startTime/endTime above are already this period's own. */
  periodIndex: number | null
  /** What this row is worth: 1 for a per-period row, the whole block for a legacy one.
   *  null when the school hasn't set a period length yet. */
  periods: number | null
}

// periodsMissed = total periods (a 2-period class = 2); periodMinutes null = period length
// not set, so clients should label the number "absences" rather than "periods".
// periodEnd ("YYYY-MM-DD") is the last day of the CURRENT record (semester for a
// university, academic year for primary/secondary), and so the furthest ahead an absence
// may be booked — one dated past it would count toward the next period and drop straight
// out of this list. null when the school has no terms set up yet.
type AbsenceList = {
  absences: TeacherAbsence[]
  periodMinutes: number | null
  periodsMissed: number
  periodEnd: string | null
}

export const getMyAbsences = async (): Promise<AbsenceList> => {
  const res = await api.get('/teacher-absences/me')
  return res.data
}

// Admin-only (server-enforced) — a specific teacher's absences. Fetching this list marks
// every not-yet-seen absence in it as seenByAdmin for NEXT time, so THIS response still
// reflects the pre-view state (delete stays available on the current visit).
export const getTeacherAbsences = async (teacherId: string, params?: { from?: string; to?: string }): Promise<AbsenceList> => {
  const res = await api.get('/teacher-absences', { params: { teacherId, ...params } })
  return res.data
}

// Admin-only — every teacher's absence total in one query, for the "By Teacher" browsing
// list. `periods` is period-weighted; `count` is raw events.
export const getAbsenceCounts = async (): Promise<{
  counts: { teacherId: string; count: number; periods: number }[]
  periodMinutes: number | null
  periodEnd: string | null
}> => {
  const res = await api.get('/teacher-absences/counts')
  return res.data
}

/** One day of a report: the whole day, or a specific set of that day's periods. */
export interface AbsenceDay {
  date: string // "YYYY-MM-DD"
  wholeDay: boolean
  timetableSlotIds?: string[]
}

// `days` reports a whole span in ONE request — a fortnight off is one call and one
// notification per admin, not fourteen of each. `count` is how many periods were actually
// newly recorded (already-reported ones are skipped, so a re-submit returns 0), and `days`
// how many separate dates those fell on.
export const reportAbsence = async (data: { days: AbsenceDay[]; teacherId?: string }) => {
  const res = await api.post('/teacher-absences', data)
  return res.data as { message: string; count: number; days: number }
}

export const deleteAbsence = async (id: string) => {
  const res = await api.delete(`/teacher-absences/${id}`)
  return res.data as { message: string }
}
