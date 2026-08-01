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

/**
 * Today's calendar date in the school's own time, as "YYYY-MM-DD".
 *
 * Date-only on purpose: it answers "has this DAY passed", not "has this class finished".
 * Booking a class for earlier today is normal — an admin entering the morning's timetable
 * at 2pm is doing paperwork, not time travel — so only yesterday and earlier are past.
 */
export function todayAtSchool(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3600_000)
  return shifted.toISOString().slice(0, 10)
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
 * The two moments that govern an absence record, in order:
 *
 *   period start ──── grace expires ──────────── period ends
 *        teacher may delete │ admin only, warned │ nobody
 *
 * `graceExpiresAtMs` is `startTime + graceMinutes`: the school's answer to "how late can a
 * teacher turn up and still count as having taught this period". Past it the period is
 * lost, so the teacher can no longer retract their own report and an admin who deletes it
 * is told what they are overriding. With no grace configured it collapses onto the period's
 * end, which is the rule that applied before the setting existed, so a school that never
 * configures one sees no warning window at all.
 */
export function graceExpiresAtMs(
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

/** Past this the period is lost: the teacher can't retract, an admin can but is warned. */
export function graceHasExpired(
  date: string,
  window: { startTime: string; endTime: string },
  graceMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  return graceExpiresAtMs(date, window, graceMinutes) <= now.getTime()
}

/** The hard stop. Once the period itself is over the record is history for EVERYONE —
 *  there is nothing left to correct, so not even an admin can change it. */
export function periodHasEnded(
  date: string,
  window: { endTime: string },
  now: Date = new Date(),
): boolean {
  return slotHasPassed(date, window.endTime, now)
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

/** An inclusive calendar-day range. Holidays and term spans are both this shape. */
export interface DateRange {
  startDate: Date
  endDate: Date
}

/**
 * Overlapping/adjacent ranges collapsed into a disjoint, sorted set.
 *
 * Essential before subtracting holidays: two entries that overlap (an admin adds "Easter"
 * 12-16 April and "Good Friday" 14 April) would otherwise each remove the same day, silently
 * deleting more teaching hours than the school actually lost.
 */
export function mergeDateRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges]
    .map((r) => ({ start: toUtcMidnight(r.startDate), end: toUtcMidnight(r.endDate) }))
    .filter((r) => r.end >= r.start)
    .sort((a, b) => a.start - b.start)
  if (sorted.length === 0) return []

  const merged: { start: number; end: number }[] = [sorted[0]]
  for (const r of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    // +1 day: ranges that merely touch (ends Fri, next starts Sat) are one closure.
    if (r.start <= last.end + MS_PER_DAY) last.end = Math.max(last.end, r.end)
    else merged.push(r)
  }
  return merged.map((r) => ({ startDate: new Date(r.start), endDate: new Date(r.end) }))
}

/** True if a "YYYY-MM-DD" falls inside any of the ranges. */
/**
 * Does this slot actually run on `dateStr`?
 *
 * A school period runs every week on its weekday, which is what the weekday check alone used
 * to assume for everything. A PRIVATE class can also be:
 *   - a single day  (`specificDate`)            -> only that exact date
 *   - time-boxed    (`startsOn` / `endsOn`)     -> its weekday, but only inside the window
 * Without this, reporting an absence offered a one-off Saturday class on every Saturday of
 * the term, and a six-week class for the whole year.
 *
 * String comparison is safe and deliberate: "YYYY-MM-DD" sorts lexicographically the same way
 * it sorts chronologically, and it avoids the timezone shift a Date round-trip would add.
 */
export function slotRunsOn(
  slot: { dayOfWeek: string; specificDate?: string | null; startsOn?: string | null; endsOn?: string | null },
  dateStr: string,
): boolean {
  if (slot.specificDate) return slot.specificDate === dateStr
  if (slot.dayOfWeek !== dateStringToDayOfWeek(dateStr)) return false
  if (slot.startsOn && dateStr < slot.startsOn) return false
  if (slot.endsOn && dateStr > slot.endsOn) return false
  return true
}

export function dateStringInAnyRange(dateStr: string, ranges: DateRange[]): boolean {
  return ranges.some((r) => dateStringWithinRange(dateStr, r.startDate, r.endDate))
}

/**
 * How many times `dayOfWeek` occurs in [rangeStart, rangeEnd], NOT counting days that fall
 * inside a holiday. `upTo` caps it at "so far" for elapsed-hours figures.
 *
 * Holidays are intersected with the range before subtracting, so a closure that starts before
 * the term or runs past its end only removes the days actually inside it.
 */
/** "YYYY-MM-DD" to a UTC Date, or null. Text in, calendar day out — see the field comments
 *  on TimetableSlot for why these are strings and not DateTime. */
function parseDateString(v?: string | null): Date | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}
const maxDate = (a: Date, b: Date | null): Date => (b && toUtcMidnight(b) > toUtcMidnight(a) ? b : a)
const minDate = (a: Date, b: Date | null): Date => (b && toUtcMidnight(b) < toUtcMidnight(a) ? b : a)

export function countTeachingWeekdays(
  dayOfWeek: DayOfWeek,
  rangeStart: Date,
  rangeEnd: Date,
  holidays: DateRange[] = [],
  upTo?: Date,
): number {
  const total = countWeekdayOccurrences(dayOfWeek, rangeStart, rangeEnd, upTo)
  if (total === 0 || holidays.length === 0) return total

  const windowStart = toUtcMidnight(rangeStart)
  const windowEnd = Math.min(toUtcMidnight(rangeEnd), upTo ? toUtcMidnight(upTo) : Infinity)
  let lost = 0
  for (const h of mergeDateRanges(holidays)) {
    const start = Math.max(toUtcMidnight(h.startDate), windowStart)
    const end = Math.min(toUtcMidnight(h.endDate), windowEnd)
    if (end < start) continue
    lost += countWeekdayOccurrences(dayOfWeek, new Date(start), new Date(end))
  }
  // Cannot go below zero even if the ranges are odd; a term fully inside a closure is 0.
  return Math.max(0, total - lost)
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
  // Bounds for a slot that recurs weekly but only for part of the term (a private class
  // booked "for six weeks"). Both null = runs the whole term, which is every school period
  // and the original behaviour. Ignored when specificDate is set, since that is one day.
  startsOn?: string | null
  endsOn?: string | null
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
  /** School closures. Periods falling inside one were never taught, so they are neither
   *  scheduled nor missable. Safe to omit — an empty list behaves exactly as before. */
  holidays?: DateRange[]
}): CoverageResult {
  const { requiredHours, slots, terms, absences, asOfDate, periodMinutes } = params
  const holidays = mergeDateRanges(params.holidays ?? [])
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
      // A one-off that lands on a closure simply did not happen.
      if (dateStringInAnyRange(slot.specificDate, holidays)) continue
      scheduledHours += hours
      const [y, m, d] = slot.specificDate.split('-').map(Number)
      if (Date.UTC(y, m - 1, d) <= asOfDay) elapsedScheduledHours += hours
      continue
    }
    for (const term of terms) {
      // A bounded slot only runs where its own window overlaps the term, so the weekly
      // count is taken over the INTERSECTION rather than the whole term. Clamping here
      // rather than filtering whole terms matters for a window that starts or ends
      // mid-term, which is the normal case for "extra classes for the next month".
      const from = maxDate(term.startDate, parseDateString(slot.startsOn))
      const to = minDate(term.endDate, parseDateString(slot.endsOn))
      if (toUtcMidnight(from) > toUtcMidnight(to)) continue // window misses this term entirely
      scheduledHours += countTeachingWeekdays(slot.dayOfWeek, from, to, holidays) * hours
      elapsedScheduledHours += countTeachingWeekdays(slot.dayOfWeek, from, to, holidays, asOfDate) * hours
    }
  }

  const slotById = new Map(slots.map((s) => [s.id, s]))
  let absentHoursToDate = 0
  let absentHoursTotal = 0
  for (const a of absences) {
    const slot = slotById.get(a.timetableSlotId)
    if (slot == null) continue
    // An absence on a closure subtracts nothing: nobody missed a class that never ran. This
    // matters when a holiday is declared AFTER teachers have already reported for those days
    // — without it the hours would be docked twice, once for the closure and once for the
    // absence.
    if (dateStringInAnyRange(a.date, holidays)) continue
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
