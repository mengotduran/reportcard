import { GradeRange, DEFAULT_RANGES } from './api/gradingScale'

export interface GradeResult {
  grade: string
  remark: string
  color: string
  bgColor: string
}

// score    - raw score (e.g. 15 out of 20)
// maxScore - maximum possible score for this subject (e.g. 20)
// ranges   - the school's custom grading scale (defined on the /20 scale)
export function gradeFromScore(score: number, maxScore: number, ranges: GradeRange[]): GradeResult {
  const score20 = maxScore > 0 ? (score / maxScore) * 20 : 0
  return gradeForScore20(score20, ranges)
}

/** Grade for a mark already on the /20 scale (e.g. a term average out of 20). */
export function gradeForScore20(score20: number, ranges: GradeRange[]): GradeResult {
  const sorted = [...(ranges.length > 0 ? ranges : DEFAULT_RANGES)].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find(r => score20 >= r.minScore && score20 <= r.maxScore)
  if (!match) return { grade: 'N/A', remark: '', color: '#6b7280', bgColor: '#f3f4f6' }
  return { grade: match.grade, remark: match.remark, color: match.color, bgColor: hexToLight(match.color) }
}

function hexToLight(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!r) return '#f3f4f6'
  return `rgba(${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}, 0.12)`
}
