import api from './client'

/**
 * ONE CLASS on one date, not one period.
 *
 * Rows are stored per period (that is what makes the hours and "N periods missed" totals
 * right), but reporting and deleting are both atomic per slot, so the API collapses them:
 * a 07:30-09:10 double arrives as a single entry with `periods: 2`. Deleting it clears every
 * period behind it. See groupByClass in the API's teacherAbsence controller.
 */
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
  /** True once the period itself is OVER: nobody, admin included, can change it. */
  isFinal: boolean
  /** True once the arrival window has closed (period start + the school's grace minutes).
   *  The teacher can no longer retract; an admin still can, but should be warned that the
   *  period was lost. Equals isFinal when the school has set no grace. */
  graceExpired: boolean
  /** True once an admin has reviewed this in the per-teacher list on a PRIOR visit — from
   *  then on it's locked for everyone, admin included. See getTeacherAbsencesApi. */
  seenByAdmin: boolean
  /** Always null now: the API returns ONE entry per class, not per period, so an entry never
   *  stands for a single period inside a block. Kept for wire compatibility. */
  periodIndex: number | null
  /** How many periods the class is worth — 2 for a 07:30-09:10 double. null when the school
   *  hasn't set a period length yet, so clients fall back to counting entries. */
  periods: number | null
}

// periodsMissed = total periods (a 2-period class = 2); periodMinutes null = period length
// not set yet, so clients should label the number "absences" rather than "periods".
type AbsenceList = { absences: TeacherAbsence[]; periodMinutes: number | null; periodsMissed: number }

export const getMyAbsencesApi = async (params?: { from?: string; to?: string }): Promise<AbsenceList> => {
  const res = await api.get('/teacher-absences/me', { params })
  return res.data
}

export const getTeacherAbsencesApi = async (teacherId: string, params?: { from?: string; to?: string }): Promise<AbsenceList> => {
  const res = await api.get('/teacher-absences', { params: { teacherId, ...params } })
  return res.data
}

// Admin-only — every teacher's absence total in one query, for the "By Teacher" browsing
// list. `periods` is the period-weighted total; `count` is raw events. Decoupled from
// coverage/required-hours entirely.
export const getAbsenceCountsApi = async (): Promise<{ counts: { teacherId: string; count: number; periods: number }[]; periodMinutes: number | null }> => {
  const res = await api.get('/teacher-absences/counts')
  return res.data
}

export const reportAbsenceApi = async (data: { date: string; wholeDay: boolean; timetableSlotIds?: string[]; teacherId?: string }) => {
  const res = await api.post('/teacher-absences', data)
  return res.data as { message: string; count: number }
}

export const deleteAbsenceApi = async (id: string) => {
  const res = await api.delete(`/teacher-absences/${id}`)
  return res.data as { message: string }
}
