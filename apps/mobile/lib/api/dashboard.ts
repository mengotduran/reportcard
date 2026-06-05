import api from './client'

export const getDashboardStats = async (): Promise<{
  students: number; teachers: number; reportCards: number; subjects: number
}> => {
  const res = await api.get('/dashboard/stats')
  return res.data
}

export interface WeeklyStats {
  labels: string[]
  students: number[]
  reportCards: number[]
  teachers: number[]
  subjects: number[]
}

export const getWeeklyStats = async (): Promise<WeeklyStats> => {
  const res = await api.get('/dashboard/weekly-stats')
  return res.data
}

export interface TeacherChartStats {
  labels: string[]
  studentCounts: { classLevel: string; count: number }[]
  subjectCounts: { classLevel: string; count: number }[]
  weeklyStudents: number[]
}

export const getTeacherChartStats = async (): Promise<TeacherChartStats> => {
  const res = await api.get('/dashboard/teacher-chart-stats')
  return res.data
}
