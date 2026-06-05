import api from './client'

export interface GradeRange {
  id: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
  color: string
}

export const DEFAULT_RANGES: GradeRange[] = [
  { id: '1', minScore: 90, maxScore: 100, grade: 'A+', remark: 'Excellent',     color: '#15803d' },
  { id: '2', minScore: 75, maxScore: 89,  grade: 'A',  remark: 'Very Good',     color: '#16a34a' },
  { id: '3', minScore: 60, maxScore: 74,  grade: 'B',  remark: 'Good',          color: '#F03E2F' },
  { id: '4', minScore: 50, maxScore: 59,  grade: 'C',  remark: 'Average',       color: '#ca8a04' },
  { id: '5', minScore: 40, maxScore: 49,  grade: 'D',  remark: 'Below Average', color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 39,  grade: 'F',  remark: 'Fail',          color: '#dc2626' },
]

export interface GradeResult {
  grade: string
  remark: string
  color: string
}

export function gradeFromScore(score: number, maxScore: number, ranges: GradeRange[]): GradeResult {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  const list = ranges.length > 0 ? ranges : DEFAULT_RANGES
  const sorted = [...list].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find(r => pct >= r.minScore && pct <= r.maxScore)
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
