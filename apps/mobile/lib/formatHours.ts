// Class periods aren't always round numbers of minutes (e.g. a 1h40m session), so
// summing several of them across a term routinely lands on an odd decimal like "28.3"
// hours — technically correct, but not something an admin reads at a glance as a real
// clock duration. "28h 20m" is the same number, just legible.
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
