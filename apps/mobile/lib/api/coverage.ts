import api from './client'

export type CoverageStatus = 'NO_TARGET' | 'UNDER' | 'EXACT' | 'OVER'

/** A course that has an hours target but nobody assigned to teach it, so it can never
 *  produce a coverage row. Returned only when the coverage list came back empty. */
export interface UnassignedTarget { name: string; classLevel: string }

/** One teacher's contribution to a course — the hours THEY taught, over the window they held
 *  it. A course handed over mid-term has two of these. */
export interface CoverageContributor {
  teacherId: string
  teacherName: string
  /** The window they held it, "YYYY-MM-DD". endedAt null = still theirs. */
  startedAt: string
  endedAt: string | null
  scheduledHours: number
  taughtHours: number
  projectedFinalHours: number
  periodsMissed: number
}

/** A stretch of the term with NO teacher on the course. Elapsed = teaching already lost;
 *  otherwise it is a staffing warning while there is still time to act. */
export interface CoverageGap {
  startDate: string
  endDate: string
  elapsed: boolean
}

/**
 * One row per COURSE, not per teacher.
 *
 * requiredHours belongs to the course, so the totals here are everyone's work added together:
 * two teachers sharing a 30-hour course are at 30 between them, never 30 each. `contributors`
 * breaks it down by who taught what; `gaps` names any stretch nobody held it.
 */
export interface CoverageRow {
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
  // Periods missed across the whole course (a 2-period class = 2); falls back to an event
  // count when periodMinutes is null. See periodMinutes on the response.
  periodsMissed: number
  contributors: CoverageContributor[]
  gaps: CoverageGap[]
}

export const getMyCoverage = async (): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null }> => {
  const res = await api.get('/coverage/me')
  return res.data
}

// Admin-only (server-enforced) — every teacher's coverage, for the admin attendance screen.
export const getCoverage = async (params?: { session?: string; teacherId?: string }): Promise<{ session: string | null; rows: CoverageRow[]; periodMinutes: number | null; unassignedTargets: UnassignedTarget[] }> => {
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
