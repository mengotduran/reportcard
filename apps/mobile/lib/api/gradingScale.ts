import api from './client'

export interface GradeRange {
  id: string
  minScore: number   // out of 20 for secondary/primary, out of 100 for university
  maxScore: number
  grade: string
  remark: string
  color: string
  gradePoint?: number   // /4.0, university GPA scales
  juryDecision?: string // e.g. "VALIDATED" / "FAIL" — a school can jury a passing-looking
                        // letter (CITEC juries D) as a fail, so it outranks the letter
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

/** The units a scale is written in: a university scale runs to 100, others to 20. */
function scaleOf(ranges: GradeRange[]): number {
  return ranges.some(r => r.maxScore > 20) ? 100 : 20
}

export function gradeFromScore(score: number, maxScore: number, ranges: GradeRange[]): GradeResult {
  const list = ranges.length > 0 ? ranges : DEFAULT_RANGES
  // Normalise onto the SCALE'S OWN units, not always /20. Scaling a university mark to
  // /20 and then matching it against /100 bands dropped every mark into the bottom
  // (0-44 = F) band, so every university grade on mobile printed as F, 95/100 included.
  const normalized = maxScore > 0 ? (score / maxScore) * scaleOf(list) : 0
  const sorted = [...list].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find(r => normalized >= r.minScore && normalized <= r.maxScore)
  return match
    ? { grade: match.grade, remark: match.remark, color: match.color }
    : { grade: 'N/A', remark: '—', color: '#6b7280' }
}

/**
 * Did this mark fail, per the school's own scale? Mirrors the web helper of the same
 * name: a band's `juryDecision` wins when set, else the grade letter or remark. Never
 * hardcodes 'F' or a pass mark, since the scale is admin-editable.
 *
 * Matches on the band's LOWER bound alone (highest first), not min..max containment:
 * integer bands (0-44, 45-49) leave gaps that a fractional mark falls through, e.g. an
 * exam of 31/70 normalises to 44.29 and would otherwise match no band and read as a pass.
 */
export function isFailingScore(score: number, ranges: GradeRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)
  const band = sorted.find(r => score >= r.minScore)
  if (!band) return false
  if (band.juryDecision?.trim()) return band.juryDecision.trim().toUpperCase() === 'FAIL'
  return band.grade?.trim().toUpperCase() === 'F' || band.remark?.trim().toUpperCase() === 'FAIL'
}

/** Did a mark out of `maxScore` fail? Normalises like gradeFromScore, so it judges a
 *  component (a university exam out of 70) as readily as a total. */
export function isFailingMark(score: number, maxScore: number, ranges: GradeRange[]): boolean {
  const list = ranges.length > 0 ? ranges : DEFAULT_RANGES
  const normalized = maxScore > 0 ? (score / maxScore) * scaleOf(list) : 0
  return isFailingScore(normalized, list)
}

export const getGradingScale = async (): Promise<{ ranges: GradeRange[] }> => {
  const res = await api.get('/grading-scale')
  return res.data
}

export const saveGradingScale = async (ranges: GradeRange[]): Promise<void> => {
  await api.put('/grading-scale', { ranges })
}
