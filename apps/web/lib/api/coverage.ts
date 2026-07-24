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
}

export const getMyCoverageApi = async (session?: string): Promise<{ session: string | null; rows: CoverageRow[] }> => {
  const res = await api.get('/coverage/me', { params: session ? { session } : undefined })
  return res.data
}

export const getCoverageApi = async (params?: { session?: string; teacherId?: string }): Promise<{ session: string | null; rows: CoverageRow[] }> => {
  const res = await api.get('/coverage', { params })
  return res.data
}
