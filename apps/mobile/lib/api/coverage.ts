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
  // Periods missed for this course (a 2-period class = 2); event count when periodMinutes null.
  periodsMissed: number
}

export const getMyCoverage = async (): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null }> => {
  const res = await api.get('/coverage/me')
  return res.data
}

// Admin-only (server-enforced) — every teacher's coverage, for the admin attendance screen.
export const getCoverage = async (params?: { session?: string; teacherId?: string }): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null }> => {
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

// Admin-only — every teacher's combined hours total (school-subject periods + private/
// extra classes), not gated on any subject having a required-hours target.
export const getTeacherHoursTotals = async (): Promise<{ totals: TeacherHoursTotal[] }> => {
  const res = await api.get('/coverage/hours-totals')
  return res.data
}
