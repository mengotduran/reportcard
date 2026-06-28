/**
 * University GPA grading (CITEC-style). Marks are entered out of 100
 * (CA /30 + Exam /70). ClassLevel.maxScore = 100 for university schools.
 * The grade, grade point (/4.0), per-course classification and the semester
 * GPA / cumulative CGPA + overall classification are derived from the /100
 * mark + course credit.
 *
 *   weighted point = grade point × credit
 *   GPA  = Σ(grade point × credit) / Σ(credit)
 *   CGPA = same, accumulated across all completed semesters.
 *
 * NOTE: The UNIVERSITY_GRADING bands below are the legacy /20 fallback.
 * The authoritative scale is stored per-school in GradingScale.ranges (JSON)
 * and is now /100 for university schools. PrintableTranscript reads those
 * live ranges — this utility is kept for API-side calculations only.
 */
export interface GpaBand {
  minScore: number   // mark boundary (out of 100 for university, out of 20 historically)
  maxScore: number
  grade: string      // letter, e.g. "A", "B+"
  gradePoint: number // /4.0
  remark: string     // per-course classification
  color: string
}

export const UNIVERSITY_GRADING: GpaBand[] = [
  { minScore: 16, maxScore: 20, grade: 'A',  gradePoint: 4.0, remark: 'Distinction',  color: '#15803d' },
  { minScore: 14, maxScore: 16, grade: 'B+', gradePoint: 3.5, remark: 'Upper Credit', color: '#16a34a' },
  { minScore: 12, maxScore: 14, grade: 'B',  gradePoint: 3.0, remark: 'Upper Credit', color: '#2563eb' },
  { minScore: 11, maxScore: 12, grade: 'C+', gradePoint: 2.5, remark: 'Lower Credit', color: '#0891b2' },
  { minScore: 10, maxScore: 11, grade: 'C',  gradePoint: 2.0, remark: 'Pass',         color: '#ca8a04' },
  { minScore: 9,  maxScore: 10, grade: 'D+', gradePoint: 1.5, remark: 'Pass',         color: '#ea580c' },
  { minScore: 8,  maxScore: 9,  grade: 'D',  gradePoint: 1.0, remark: 'Pass',         color: '#f97316' },
  { minScore: 0,  maxScore: 8,  grade: 'F',  gradePoint: 0.0, remark: 'Fail',         color: '#dc2626' },
]

export function gpaGradeFor(score20: number, bands: GpaBand[] = UNIVERSITY_GRADING): GpaBand {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore)
  return sorted.find(b => score20 >= b.minScore && score20 <= b.maxScore) ?? sorted[sorted.length - 1]
}

/** Semester/cumulative GPA from (mark/20, credit) pairs. */
export function computeGpa(courses: { score20: number; credit: number }[], bands?: GpaBand[]): number {
  let pts = 0, cr = 0
  for (const c of courses) {
    if (c.score20 == null) continue
    pts += gpaGradeFor(c.score20, bands).gradePoint * c.credit
    cr += c.credit
  }
  return cr > 0 ? pts / cr : 0
}

/** Overall classification from a GPA/CGPA. */
export function classificationFor(gpa: number): string {
  if (gpa >= 3.60) return 'Distinction'
  if (gpa >= 2.80) return 'Upper Credit'
  if (gpa >= 2.40) return 'Lower Credit'
  if (gpa >= 2.00) return 'Pass'
  return 'Fail'
}
