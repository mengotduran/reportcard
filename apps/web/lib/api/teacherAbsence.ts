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

export const getMyAbsencesApi = async (params?: { from?: string; to?: string }): Promise<{ absences: TeacherAbsence[] }> => {
  const res = await api.get('/teacher-absences/me', { params })
  return res.data
}

export const getTeacherAbsencesApi = async (teacherId: string, params?: { from?: string; to?: string }): Promise<{ absences: TeacherAbsence[] }> => {
  const res = await api.get('/teacher-absences', { params: { teacherId, ...params } })
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
