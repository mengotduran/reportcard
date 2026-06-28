import api from './client'

export interface GradeRange {
  id: string
  minScore: number   // mark out of 20 (0–20) for secondary, or out of 100 (0–100) for university
  maxScore: number
  grade: string      // e.g. "A+", "A", "B"
  remark: string     // e.g. "Excellent"
  color: string      // hex color for badge
  gradePoint?: number  // /4.0, for university GPA scales
  juryDecision?: string // e.g. "VALIDATED", "FAIL" — shown on university transcripts
}

export interface ClassificationBand {
  min: number  // lower CGPA bound
  max: number  // upper CGPA bound
  label: string // e.g. "Distinction"
}

export interface LegendRow {
  abbr: string    // e.g. "I", "GP", "CGPA"
  meaning: string // e.g. "Incomplete", "Grade Point"
}

/** GPA (/4.0) for a /20 mark using ranges that carry a gradePoint; else null. */
export function gradePointForScore20(score20: number, ranges: GradeRange[]): number | null {
  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)
  const m = sorted.find(r => score20 >= r.minScore && score20 <= r.maxScore)
  return m?.gradePoint ?? null
}

/** Jury decision for a given score — uses per-range `juryDecision` field, falls back to grade-letter heuristic. */
export function juryDecisionForScore(score: number, ranges: GradeRange[]): string {
  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)
  const m = sorted.find(r => score >= r.minScore && score <= r.maxScore)
  if (m?.juryDecision) return m.juryDecision
  return m?.grade === 'F' ? 'FAIL' : 'VALIDATED'
}

/** Overall GPA/CGPA classification from a list of editable bands. */
export function classificationForGpa(gpa: number, bands: ClassificationBand[] = DEFAULT_CLASSIFICATION_BANDS): string {
  const sorted = [...bands].sort((a, b) => b.min - a.min)
  return sorted.find(b => gpa >= b.min && gpa <= b.max)?.label ?? 'Fail'
}

export const DEFAULT_RANGES: GradeRange[] = [
  { id: '1', minScore: 18, maxScore: 20, grade: 'A+', remark: 'Excellent',   color: '#15803d' },
  { id: '2', minScore: 16, maxScore: 18, grade: 'A',  remark: 'Very Good',   color: '#16a34a' },
  { id: '3', minScore: 14, maxScore: 16, grade: 'B',  remark: 'Good',        color: '#2563eb' },
  { id: '4', minScore: 12, maxScore: 14, grade: 'C',  remark: 'Fairly Good', color: '#ca8a04' },
  { id: '5', minScore: 10, maxScore: 12, grade: 'D',  remark: 'Average',     color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 10, grade: 'F',  remark: 'Fail',        color: '#dc2626' },
]

export const DEFAULT_UNIVERSITY_RANGES: GradeRange[] = [
  { id: 'u1', minScore: 80, maxScore: 100, grade: 'A',  remark: 'Excellent',   color: '#15803d', gradePoint: 4.0, juryDecision: 'VALIDATED' },
  { id: 'u2', minScore: 70, maxScore: 79,  grade: 'B+', remark: 'Very Good',   color: '#2563eb', gradePoint: 3.5, juryDecision: 'VALIDATED' },
  { id: 'u3', minScore: 60, maxScore: 69,  grade: 'B',  remark: 'Good',        color: '#3b82f6', gradePoint: 3.0, juryDecision: 'VALIDATED' },
  { id: 'u4', minScore: 55, maxScore: 59,  grade: 'C+', remark: 'Fairly Good', color: '#0891b2', gradePoint: 2.5, juryDecision: 'VALIDATED' },
  { id: 'u5', minScore: 50, maxScore: 54,  grade: 'C',  remark: 'Average',     color: '#ca8a04', gradePoint: 2.0, juryDecision: 'VALIDATED' },
  { id: 'u6', minScore: 45, maxScore: 49,  grade: 'D',  remark: 'Poor',        color: '#ea580c', gradePoint: 1.0, juryDecision: 'VALIDATED' },
  { id: 'u7', minScore: 0,  maxScore: 44,  grade: 'F',  remark: 'Fail',        color: '#dc2626', gradePoint: 0.0, juryDecision: 'FAIL' },
]

export const DEFAULT_CLASSIFICATION_BANDS: ClassificationBand[] = [
  { min: 3.60, max: 4.00, label: 'Distinction' },
  { min: 2.80, max: 3.59, label: 'Upper Credit' },
  { min: 2.40, max: 2.79, label: 'Lower Credit' },
  { min: 2.00, max: 2.39, label: 'Pass' },
  { min: 0.00, max: 1.99, label: 'Fail' },
]

export const DEFAULT_LEGEND_ROWS: LegendRow[] = [
  { abbr: 'I',    meaning: 'Incomplete' },
  { abbr: 'X',    meaning: 'Absent' },
  { abbr: '*',    meaning: 'After resit' },
  { abbr: 'GP',   meaning: 'Grade Point' },
  { abbr: 'GPA',  meaning: 'Grade Pt Average' },
  { abbr: 'CGPA', meaning: 'Cumulative GPA' },
  { abbr: 'WP',   meaning: 'Credit × GP' },
]

export const getGradingScaleApi = async (): Promise<{ ranges: GradeRange[]; classificationBands: ClassificationBand[]; legendRows: LegendRow[] }> => {
  const res = await api.get('/grading-scale')
  return { ...res.data, legendRows: res.data.legendRows ?? [] }
}

export const saveGradingScaleApi = async (ranges: GradeRange[], classificationBands: ClassificationBand[] = [], legendRows: LegendRow[] = []) => {
  const res = await api.put('/grading-scale', { ranges, classificationBands, legendRows })
  return res.data
}
