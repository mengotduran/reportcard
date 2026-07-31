import api from './client'

export interface TimetableSlot {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  room?: string | null
  subjectId?: string | null
  label?: string | null
  subjectName?: string | null
  classLevel?: string | null
  // "YYYY-MM-DD" — set only for a one-off private/extra slot that doesn't repeat every
  // week. null means it recurs weekly on dayOfWeek, same as before.
  specificDate?: string | null
  /** Window for a private class that runs weekly but only part of the term. Both null =
   *  the whole term. Ignored when specificDate is set. */
  startsOn?: string | null
  endsOn?: string | null
  /** Course a private class delivers hours toward, if any. */
  privateSubjectId?: string | null
}

export const getTeacherTimetableApi = async (teacherId: string): Promise<{ slots: TimetableSlot[] }> => {
  const res = await api.get('/timetable', { params: { teacherId } })
  return res.data
}

export const saveTimetableApi = async (teacherId: string, slots: {
  dayOfWeek: string; startTime: string; endTime: string
  subjectId?: string | null; label?: string | null; room?: string | null; specificDate?: string | null
  startsOn?: string | null; endsOn?: string | null; privateSubjectId?: string | null
}[]) => {
  const res = await api.put('/timetable', { slots }, { params: { teacherId } })
  // `reassigned` appears when scheduling a course took it off another lecturer
  // (universities only — one lecturer per course). They're notified in-app; this is so
  // the admin doing it sees it happened too.
  return res.data as { message: string; reassigned?: string[] }
}

export interface TimetableHistoryVersion {
  archivedAt: string
  slots: TimetableSlot[]
}

export const getTimetableHistoryApi = async (teacherId: string): Promise<{ versions: TimetableHistoryVersion[] }> => {
  const res = await api.get('/timetable/history', { params: { teacherId } })
  return res.data
}

export const deleteTimetableHistoryVersionApi = async (teacherId: string, archivedAt: string) => {
  const res = await api.delete('/timetable/history', { data: { teacherId, archivedAt } })
  return res.data as { message: string }
}

export const getMyTimetableApi = async (): Promise<{ slots: TimetableSlot[] }> => {
  const res = await api.get('/timetable/me')
  return res.data
}

export interface SchoolTimetableSlot {
  id: string
  teacherId: string
  teacherName: string
  dayOfWeek: string
  startTime: string
  endTime: string
  classLevel: string | null
}

export const getSchoolTimetableApi = async (): Promise<{ slots: SchoolTimetableSlot[] }> => {
  const res = await api.get('/timetable/school')
  return res.data
}

export interface TimetablePeriod {
  id: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export const getPeriodsApi = async (): Promise<{ periods: TimetablePeriod[]; periodMinutes: number | null }> => {
  const res = await api.get('/timetable/periods')
  return res.data
}

export const savePeriodsApi = async (periods: { startTime: string; endTime: string; isBreak: boolean }[], periodMinutes: number | null) => {
  const res = await api.put('/timetable/periods', { periods, periodMinutes })
  return res.data as { message: string }
}
