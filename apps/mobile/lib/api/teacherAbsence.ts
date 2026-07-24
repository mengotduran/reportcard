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
}

export const getMyAbsences = async (): Promise<{ absences: TeacherAbsence[] }> => {
  const res = await api.get('/teacher-absences/me')
  return res.data
}

export const reportAbsence = async (data: { date: string; wholeDay: boolean; timetableSlotIds?: string[] }) => {
  const res = await api.post('/teacher-absences', data)
  return res.data as { message: string; count: number }
}

export const deleteAbsence = async (id: string) => {
  const res = await api.delete(`/teacher-absences/${id}`)
  return res.data as { message: string }
}
