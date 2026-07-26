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
   *  then on it's locked for everyone, admin included. See getTeacherAbsencesApi. */
  seenByAdmin: boolean
  /** How many periods this one missed class is worth (a 2-period class = 2); null when the
   *  school hasn't set a period length yet. */
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
