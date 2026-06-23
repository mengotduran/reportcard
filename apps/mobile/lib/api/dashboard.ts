import api from './client'

export const getDashboardStats = async (session?: string): Promise<{
  students: number; teachers: number; reportCards: number; subjects: number; session: string | null
}> => {
  const res = await api.get('/dashboard/stats', { params: session ? { session } : {} })
  return res.data
}

export interface AcademicYear { session: string; current: boolean }

export const getAcademicYears = async (): Promise<{ academicYears: AcademicYear[] }> => {
  const res = await api.get('/dashboard/academic-years')
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
