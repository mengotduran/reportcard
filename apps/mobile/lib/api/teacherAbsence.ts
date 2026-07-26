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
  /** True once the period's scheduled end time is in the past — the API is the real
   *  gate on delete either way, this is just enough for the UI to grey the button out. */
  hourHasPassed: boolean
  /** True once an admin has reviewed this in the per-teacher list on a PRIOR visit — from
   *  then on it's locked for everyone, admin included. See getTeacherAbsences below. */
  seenByAdmin: boolean
  /** How many periods this one missed class is worth (a 2-period class = 2); null when the
   *  school hasn't set a period length yet. */
  periods: number | null
}

// periodsMissed = total periods (a 2-period class = 2); periodMinutes null = period length
// not set, so clients should label the number "absences" rather than "periods".
type AbsenceList = { absences: TeacherAbsence[]; periodMinutes: number | null; periodsMissed: number }

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
export const getAbsenceCounts = async (): Promise<{ counts: { teacherId: string; count: number; periods: number }[]; periodMinutes: number | null }> => {
  const res = await api.get('/teacher-absences/counts')
  return res.data
}

export const reportAbsence = async (data: { date: string; wholeDay: boolean; timetableSlotIds?: string[]; teacherId?: string }) => {
  const res = await api.post('/teacher-absences', data)
  return res.data as { message: string; count: number }
}

export const deleteAbsence = async (id: string) => {
  const res = await api.delete(`/teacher-absences/${id}`)
  return res.data as { message: string }
}
