import api from './client'

export interface GradeRange {
  id: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
  color: string
}

// Ranges on the /20 mark scale teachers & report cards use (boundary → higher grade).
export const DEFAULT_RANGES: GradeRange[] = [
  { id: '1', minScore: 18, maxScore: 20, grade: 'A+', remark: 'Excellent',   color: '#15803d' },
  { id: '2', minScore: 16, maxScore: 18, grade: 'A',  remark: 'Very Good',   color: '#16a34a' },
  { id: '3', minScore: 14, maxScore: 16, grade: 'B',  remark: 'Good',        color: '#F03E2F' },
  { id: '4', minScore: 12, maxScore: 14, grade: 'C',  remark: 'Fairly Good', color: '#ca8a04' },
  { id: '5', minScore: 10, maxScore: 12, grade: 'D',  remark: 'Average',     color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 10, grade: 'F',  remark: 'Fail',        color: '#dc2626' },
]

export interface GradeResult {
  grade: string
  remark: string
  color: string
}

export function gradeFromScore(score: number, maxScore: number, ranges: GradeRange[]): GradeResult {
  const score20 = maxScore > 0 ? (score / maxScore) * 20 : 0
  const list = ranges.length > 0 ? ranges : DEFAULT_RANGES
  const sorted = [...list].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find(r => score20 >= r.minScore && score20 <= r.maxScore)
  return match
    ? { grade: match.grade, remark: match.remark, color: match.color }
    : { grade: 'N/A', remark: '—', color: '#6b7280' }
}

export const getGradingScale = async (): Promise<{ ranges: GradeRange[] }> => {
  const res = await api.get('/grading-scale')
  return res.data
}

export const saveGradingScale = async (ranges: GradeRange[]): Promise<void> => {
  await api.put('/grading-scale', { ranges })
}
