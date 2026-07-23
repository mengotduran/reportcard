// Turns a teacher's weekly timetable + real term dates into an actual hour count for a
// subject/course, without needing a day-by-day attendance register. A course's timetable
// slot recurs every week of its term(s) — so "hours scheduled" is just "how many times
// does this weekday occur in this date range", times the slot's duration. Absences
// subtract from that. This is the only place that arithmetic lives; the coverage and
// teacher-absence controllers both call into it so the numbers can never drift apart.

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

const DAY_ORDER: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// JS Date#getUTCDay() is Sunday-first (0-6); DAY_ORDER is Monday-first, matching how the
// timetable already stores dayOfWeek. This maps one to the other.
const JS_DAY_TO_DAY_OF_WEEK: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Midnight UTC on the given date's calendar day — the school year has no time zone of
 *  its own, so every date comparison here works in whole calendar days, not instants. */
function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function slotDurationHours(slot: { startTime: string; endTime: string }): number {
  const minutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)
  return Math.max(0, minutes) / 60
}

/** Which weekday a "YYYY-MM-DD" string falls on, so an absence report ("I'll be out on
 *  this date") can be matched against the teacher's Monday-Sunday timetable. */
export function dateStringToDayOfWeek(dateStr: string): DayOfWeek {
  const [y, m, d] = dateStr.split('-').map(Number)
  return JS_DAY_TO_DAY_OF_WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/**
 * How many times `dayOfWeek` occurs between rangeStart and rangeEnd (inclusive), capped
 * at `upTo` if given (used to count only elapsed occurrences so far). Closed-form rather
 * than a day-by-day loop since a term can span many weeks.
 */
export function countWeekdayOccurrences(dayOfWeek: DayOfWeek, rangeStart: Date, rangeEnd: Date, upTo?: Date): number {
  const start = toUtcMidnight(rangeStart)
  let end = toUtcMidnight(rangeEnd)
  if (upTo) end = Math.min(end, toUtcMidnight(upTo))
  if (end < start) return 0

  const targetDow = DAY_ORDER.indexOf(dayOfWeek)
  if (targetDow === -1) return 0

  // Days to add to `start` to reach the first occurrence of targetDow on/after start.
  const startDow = DAY_ORDER.indexOf(JS_DAY_TO_DAY_OF_WEEK[new Date(start).getUTCDay()] as DayOfWeek)
  const offset = (targetDow - startDow + 7) % 7
  const firstOccurrence = start + offset * MS_PER_DAY
  if (firstOccurrence > end) return 0

  return Math.floor((end - firstOccurrence) / (7 * MS_PER_DAY)) + 1
}

export interface ScopeTerm {
  id: string
  name: string
  startDate: Date
  endDate: Date
}

export interface ScopedSubject {
  id: string
  term: string | null
}

/**
 * Which Term row(s) a subject's requiredHours target applies to. University courses
 * name a specific semester via `Subject.term` (matched by Term.name, same lookup the
 * rest of the app already does for this field). Primary/secondary subjects leave `term`
 * null, meaning "the whole academic year" — every term in the session counts.
 */
export function resolveScopeTerms(subject: ScopedSubject, termsInSession: ScopeTerm[]): ScopeTerm[] {
  if (!subject.term) return termsInSession
  const match = termsInSession.find((t) => t.name === subject.term)
  return match ? [match] : []
}

export interface CoverageSlot {
  id: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
}

export interface CoverageAbsence {
  timetableSlotId: string
  date: string // "YYYY-MM-DD"
}

export type CoverageStatus = 'NO_TARGET' | 'UNDER' | 'EXACT' | 'OVER'

export interface CoverageResult {
  requiredHours: number | null
  scheduledHours: number
  elapsedScheduledHours: number
  absentHoursToDate: number
  absentHoursTotal: number
  taughtHours: number
  projectedFinalHours: number
  status: CoverageStatus
  /** True once every scope term has ended — the status is then final, not a projection. */
  isFinal: boolean
}

// Below this many hours' difference, call it an exact match — real-world scheduling
// (a slot that's 55 minutes instead of a round hour, etc) will otherwise never land on
// a perfectly whole number.
const EXACT_MATCH_TOLERANCE_HOURS = 0.5

export function computeCoverage(params: {
  requiredHours: number | null
  slots: CoverageSlot[]
  terms: ScopeTerm[]
  absences: CoverageAbsence[]
  asOfDate: Date
}): CoverageResult {
  const { requiredHours, slots, terms, absences, asOfDate } = params

  let scheduledHours = 0
  let elapsedScheduledHours = 0
  for (const slot of slots) {
    const hours = slotDurationHours(slot)
    for (const term of terms) {
      scheduledHours += countWeekdayOccurrences(slot.dayOfWeek, term.startDate, term.endDate) * hours
      elapsedScheduledHours += countWeekdayOccurrences(slot.dayOfWeek, term.startDate, term.endDate, asOfDate) * hours
    }
  }

  const slotHoursById = new Map(slots.map((s) => [s.id, slotDurationHours(s)]))
  const asOfDay = toUtcMidnight(asOfDate)
  let absentHoursToDate = 0
  let absentHoursTotal = 0
  for (const a of absences) {
    const hours = slotHoursById.get(a.timetableSlotId)
    if (hours == null) continue
    absentHoursTotal += hours
    const [y, m, d] = a.date.split('-').map(Number)
    if (Date.UTC(y, m - 1, d) <= asOfDay) absentHoursToDate += hours
  }

  const taughtHours = Math.max(0, elapsedScheduledHours - absentHoursToDate)
  const projectedFinalHours = Math.max(0, scheduledHours - absentHoursTotal)
  const isFinal = terms.length > 0 && terms.every((t) => toUtcMidnight(t.endDate) < asOfDay)
  const finalHours = isFinal ? taughtHours : projectedFinalHours

  let status: CoverageStatus = 'NO_TARGET'
  if (requiredHours != null) {
    const diff = finalHours - requiredHours
    status = Math.abs(diff) <= EXACT_MATCH_TOLERANCE_HOURS ? 'EXACT' : diff > 0 ? 'OVER' : 'UNDER'
  }

  return {
    requiredHours,
    scheduledHours,
    elapsedScheduledHours,
    absentHoursToDate,
    absentHoursTotal,
    taughtHours,
    projectedFinalHours,
    status,
    isFinal,
  }
}
