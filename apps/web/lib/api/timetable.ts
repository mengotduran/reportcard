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
}

export const getTeacherTimetableApi = async (teacherId: string): Promise<{ slots: TimetableSlot[] }> => {
  const res = await api.get('/timetable', { params: { teacherId } })
  return res.data
}

export const saveTimetableApi = async (teacherId: string, slots: {
  dayOfWeek: string; startTime: string; endTime: string
  subjectId?: string | null; label?: string | null; room?: string | null
}[]) => {
  const res = await api.put('/timetable', { slots }, { params: { teacherId } })
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

export const getPeriodsApi = async (): Promise<{ periods: TimetablePeriod[] }> => {
  const res = await api.get('/timetable/periods')
  return res.data
}

export const savePeriodsApi = async (periods: { startTime: string; endTime: string; isBreak: boolean }[]) => {
  const res = await api.put('/timetable/periods', { periods })
  return res.data as { message: string }
}
