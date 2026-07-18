import { GradeRange, DEFAULT_RANGES, isFailingScore } from './api/gradingScale'

export interface GradeResult {
  grade: string
  remark: string
  color: string
  bgColor: string
}

// score    - raw score (e.g. 15 out of 20, or 75 out of 100)
// maxScore - maximum possible score for this subject
// ranges   - the school's custom grading scale (auto-detected: /20 for secondary, /100 for university)
export function gradeFromScore(score: number, maxScore: number, ranges: GradeRange[]): GradeResult {
  // Detect scale from ranges: if any boundary exceeds 20 it's a /100 university scale.
  const rangeScale = ranges.length > 0 && ranges.some(r => r.maxScore > 20) ? 100 : 20
  const normalizedScore = maxScore > 0 ? (score / maxScore) * rangeScale : 0
  return gradeForScore20(normalizedScore, ranges)
}

/**
 * Did a mark out of `maxScore` fail, per the school's own scale? Normalises onto the
 * scale's units exactly like gradeFromScore, then defers to isFailingScore — so it
 * reads a failing band the same way the printed report card does (jury decision first,
 * never a hardcoded 'F' or pass mark).
 *
 * Works on a COMPONENT as well as a total: a university exam mark out of 70 normalises
 * to /100 before being judged, which is how resit eligibility asks "did they fail the
 * exam?" without hardcoding 35.
 */
export function isFailingMark(score: number, maxScore: number, ranges: GradeRange[]): boolean {
  const list = ranges.length > 0 ? ranges : DEFAULT_RANGES
  const rangeScale = list.some(r => r.maxScore > 20) ? 100 : 20
  const normalized = maxScore > 0 ? (score / maxScore) * rangeScale : 0
  return isFailingScore(normalized, list)
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
