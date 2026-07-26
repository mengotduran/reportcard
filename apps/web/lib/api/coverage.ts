import api from './client'

export type CoverageStatus = 'NO_TARGET' | 'UNDER' | 'EXACT' | 'OVER'

export interface CoverageRow {
  teacherId: string
  teacherName: string
  subjectId: string
  subjectName: string
  classLevel: string
  term: string | null
  requiredHours: number | null
  scheduledHours: number
  taughtHours: number
  projectedFinalHours: number
  status: CoverageStatus
  isFinal: boolean
  // Periods missed for this course (a 2-period class = 2); falls back to an event count
  // when periodMinutes is null. See periodMinutes on the response.
  periodsMissed: number
}

export const getMyCoverageApi = async (session?: string): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null }> => {
  const res = await api.get('/coverage/me', { params: session ? { session } : undefined })
  return res.data
}

export const getCoverageApi = async (params?: { session?: string; teacherId?: string }): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null }> => {
  const res = await api.get('/coverage', { params })
  return res.data
}

export interface TeacherHoursTotal {
  teacherId: string
  teacherName: string
  scheduledHours: number
  taughtHours: number
  projectedFinalHours: number
  isFinal: boolean
}

export const getTeacherHoursTotalsApi = async (): Promise<{ totals: TeacherHoursTotal[] }> => {
  const res = await api.get('/coverage/hours-totals')
  return res.data
}
