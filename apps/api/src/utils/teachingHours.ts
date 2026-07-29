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

/** True if a "YYYY-MM-DD" date string falls within [start, end] (inclusive). Used to stop
 *  an absence recorded in a PRIOR academic session/term from counting against the
 *  current one — TimetableSlot rows persist unchanged across year rollover (nothing
 *  recreates them), so matching only on slot ID isn't enough on its own. */
export function dateStringWithinRange(dateStr: string, start: Date, end: Date): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  return t >= toUtcMidnight(start) && t <= toUtcMidnight(end)
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function slotDurationHours(slot: { startTime: string; endTime: string }): number {
  const minutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)
  return Math.max(0, minutes) / 60
}

// How many school PERIODS a slot spans (attendance is counted in periods, not clock
// hours): a 100-minute class with a 50-minute period is 2 periods. Rounded to the nearest
// whole period (going forward slots are exact multiples; this just tolerates legacy data),
// min 1 — a missed class is never zero periods. null when the school hasn't set a period
// length yet, so callers can fall back to a plain event count.
export function slotPeriods(startTime: string, endTime: string, periodMinutes: number | null | undefined): number | null {
  if (!periodMinutes || periodMinutes <= 0) return null
  const dur = timeToMinutes(endTime) - timeToMinutes(startTime)
  return Math.max(1, Math.round(dur / periodMinutes))
}

// Cameroon is UTC+1 (WAT) year-round, no DST. There's no per-school timezone field yet,
// so this assumes WAT — fine for the calendar-day comparisons used elsewhere in this
// file, and close enough for the hour-level cutoff this specific check needs.
const SCHOOL_UTC_OFFSET_HOURS = 1

/** True once `date` (YYYY-MM-DD) + a slot's `endTime` (HH:MM) is in the past, in the
 *  school's local time — used to stop a teacher reporting or deleting an absence for a
 *  period that has already happened. Any earlier calendar day is always true. */
export function slotHasPassed(date: string, endTime: string, now: Date = new Date()): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = endTime.split(':').map(Number)
  const slotEndUtcMs = Date.UTC(y, m - 1, d, hh - SCHOOL_UTC_OFFSET_HOURS, mm || 0)
  return slotEndUtcMs <= now.getTime()
}

const minutesToTime = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** One school period inside a timetable slot. `index` is 0-based and is what a
 *  TeacherAbsence row stores, so a record always names the exact period it refers to. */
export interface PeriodWindow {
  index: number
  startTime: string
  endTime: string
}

/**
 * A slot broken into the individual periods it spans.
 *
 * A double period is ONE timetable slot but TWO periods, and attendance is judged per
 * period: a teacher who arrives twenty minutes into a double period has missed the first
 * period, not the block. When the school has no period length set the slot can't be split,
 * so it stands as a single window and behaves exactly as it did before.
 */
export function periodWindows(
  startTime: string,
  endTime: string,
  periodMinutes: number | null | undefined,
): PeriodWindow[] {
  const count = slotPeriods(startTime, endTime, periodMinutes)
  if (count == null || count <= 1 || !periodMinutes) return [{ index: 0, startTime, endTime }]
  const start = timeToMinutes(startTime)
  return Array.from({ length: count }, (_, index) => ({
    index,
    startTime: minutesToTime(start + index * periodMinutes),
    // The last window keeps the slot's real end time, so rounding can never leave a gap
    // or overshoot into the next class.
    endTime: index === count - 1 ? endTime : minutesToTime(start + (index + 1) * periodMinutes),
  }))
}

/**
 * The moment an absence against `window` becomes FINAL: from then on nobody, admin
 * included, can mark the teacher present for it again.
 *
 * With a grace period configured this is `startTime + graceMinutes` — the school's answer
 * to "how late can a teacher turn up and still count as having taught this period". With
 * none set it falls back to the period's END, which is the rule that applied before the
 * setting existed, so a school that never configures it sees no change.
 */
export function absenceFinalAtMs(
  date: string,
  window: { startTime: string; endTime: string },
  graceMinutes: number | null | undefined,
  ): number {
  const useGrace = graceMinutes != null && graceMinutes >= 0
  const [hh, mm] = (useGrace ? window.startTime : window.endTime).split(':').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  const base = Date.UTC(y, m - 1, d, hh - SCHOOL_UTC_OFFSET_HOURS, mm || 0)
  return base + (useGrace ? graceMinutes * 60_000 : 0)
}

/** True once that moment has passed. */
export function absenceIsFinal(
  date: string,
  window: { startTime: string; endTime: string },
  graceMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  return absenceFinalAtMs(date, window, graceMinutes) <= now.getTime()
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
  // "YYYY-MM-DD" — set only for a one-off private/extra slot that happens on that single
  // date instead of recurring every week. When set, this slot contributes its duration
  // exactly once (on that date) rather than once per week across the scope terms.
  specificDate?: string | null
}

export interface CoverageAbsence {
  timetableSlotId: string
  date: string // "YYYY-MM-DD"
  /** Which period of the slot was missed; null for a legacy row covering the whole slot.
   *  Without this a split double period would subtract the block's hours twice. */
  periodIndex?: number | null
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
  /** Needed to work out what one period of a multi-period slot is worth. */
  periodMinutes?: number | null
}): CoverageResult {
  const { requiredHours, slots, terms, absences, asOfDate, periodMinutes } = params
  const asOfDay = toUtcMidnight(asOfDate)

  let scheduledHours = 0
  let elapsedScheduledHours = 0
  for (const slot of slots) {
    const hours = slotDurationHours(slot)
    // A one-off slot (specificDate set) happens exactly once, on that calendar date —
    // not once per week across every scope term like a recurring slot. Counted
    // regardless of whether that date actually falls inside any scope term: it's tied to
    // a real date, not a recurring weekday pattern the term range is measuring.
    if (slot.specificDate) {
      scheduledHours += hours
      const [y, m, d] = slot.specificDate.split('-').map(Number)
      if (Date.UTC(y, m - 1, d) <= asOfDay) elapsedScheduledHours += hours
      continue
    }
    for (const term of terms) {
      scheduledHours += countWeekdayOccurrences(slot.dayOfWeek, term.startDate, term.endDate) * hours
      elapsedScheduledHours += countWeekdayOccurrences(slot.dayOfWeek, term.startDate, term.endDate, asOfDate) * hours
    }
  }

  const slotById = new Map(slots.map((s) => [s.id, s]))
  let absentHoursToDate = 0
  let absentHoursTotal = 0
  for (const a of absences) {
    const slot = slotById.get(a.timetableSlotId)
    if (slot == null) continue
    const slotHours = slotDurationHours(slot)
    // A per-period row costs ONE period's share of the block, not the whole block: a double
    // period that's been split into two rows must still subtract the same total as the one
    // row it replaced. A legacy row (null index) already stands for the entire slot.
    const count = a.periodIndex != null ? (slotPeriods(slot.startTime, slot.endTime, periodMinutes) ?? 1) : 1
    const hours = slotHours / Math.max(1, count)
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
