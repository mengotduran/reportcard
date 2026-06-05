import api from './client'

export interface GradeRange {
  id: string
  minScore: number   // percentage 0–100
  maxScore: number
  grade: string      // e.g. "A+", "A", "B"
  remark: string     // e.g. "Excellent"
  color: string      // hex color for badge
}

export const DEFAULT_RANGES: GradeRange[] = [
  { id: '1', minScore: 90, maxScore: 100, grade: 'A+', remark: 'Excellent',     color: '#15803d' },
  { id: '2', minScore: 75, maxScore: 89,  grade: 'A',  remark: 'Very Good',     color: '#16a34a' },
  { id: '3', minScore: 60, maxScore: 74,  grade: 'B',  remark: 'Good',          color: '#2563eb' },
  { id: '4', minScore: 50, maxScore: 59,  grade: 'C',  remark: 'Average',       color: '#ca8a04' },
  { id: '5', minScore: 40, maxScore: 49,  grade: 'D',  remark: 'Below Average', color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 39,  grade: 'F',  remark: 'Fail',          color: '#dc2626' },
]

export const getGradingScaleApi = async (): Promise<{ ranges: GradeRange[] }> => {
  const res = await api.get('/grading-scale')
  return res.data
}

export const saveGradingScaleApi = async (ranges: GradeRange[]) => {
  const res = await api.put('/grading-scale', { ranges })
  return res.data
}
