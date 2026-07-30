// Cameroon is UTC+1 (WAT) year-round, no DST, and there is no per-school timezone field
// yet. Mirrors the API's slotHasPassed (apps/api/src/utils/teachingHours.ts) so the UI
// reaches the same verdict the server will, rather than only finding out after a rejected
// request. Kept in one place because two copies of a cutoff rule drift.
const SCHOOL_UTC_OFFSET_HOURS = 1

/** True once `date` ("YYYY-MM-DD") at `time` ("HH:MM") is in the past, school-local. */
export function hasPassed(date: string, time: string, now: Date = new Date()): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh - SCHOOL_UTC_OFFSET_HOURS, mm || 0) <= now.getTime()
}
