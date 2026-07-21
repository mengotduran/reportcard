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
}

export const getMyTimetable = async (): Promise<{ slots: MyTimetableSlot[] }> => {
  const res = await api.get('/timetable/me')
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
