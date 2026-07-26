import api from './client'

export interface MyTimetableSlot {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  room?: string | null
  classLevel?: string | null
  subjectId?: string | null
  subjectName?: string | null
  label?: string | null // set for a private/personal slot (subjectId is null)
  // "YYYY-MM-DD" — set only for a one-off private slot that doesn't repeat every week.
  specificDate?: string | null
}

export const getMyTimetable = async (): Promise<{ slots: MyTimetableSlot[] }> => {
  const res = await api.get('/timetable/me')
  return res.data
}

// Admin-only (server-enforced) — a specific teacher's timetable, for the admin's
// report-absence-on-their-behalf flow.
export const getTeacherTimetable = async (teacherId: string): Promise<{ slots: MyTimetableSlot[] }> => {
  const res = await api.get('/timetable', { params: { teacherId } })
  return res.data
}

export interface TimetablePeriod {
  id: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export const getPeriods = async (): Promise<{ periods: TimetablePeriod[] }> => {
  const res = await api.get('/timetable/periods')
  return res.data
}
