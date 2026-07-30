/**
 * Where tapping a notification takes the recipient, stored on the row (`Notification.data`)
 * at the moment it's created rather than resolved on read.
 *
 * Storing it is not an optimisation, it's the only thing that works: a retraction DELETES
 * the absence and a reassignment ARCHIVES the timetable slots, so by the time anyone opens
 * the message the state it describes is already gone.
 *
 * Every kind so far leads to a timetable, so they all carry a `teacherId`. Clients compare
 * it with their own id to pick the destination: their own timetable if it matches, the
 * read-only view of that teacher's if it doesn't.
 *
 * The remaining fields are per-kind and mutually exclusive. Anything reading them must cope
 * with all of them being absent, since rows written before links existed have `data: null`.
 */
export type NotificationLink = {
  teacherId: string
  teacherName: string

  // ── Absence, one slot on one date ──
  /** Set only when the notification concerns a single class. */
  timetableSlotId?: string
  date?: string
  startTime?: string
  endTime?: string

  // ── Absence, wider than one class ──
  /** Set instead of the above when more than one slot or date is covered. */
  dateFrom?: string
  dateTo?: string
  periods?: number

  /** The absence was REMOVED. The target screen has to say so: the row is gone, so the grid
   *  looks entirely ordinary and would otherwise explain nothing. */
  retracted?: boolean

  // ── Course reassignment ──
  /** The courses that moved away, already formatted for display ("Analysis (Level 2)").
   *  Their timetable slots are archived, so they are absent from the grid entirely — the
   *  banner is the only thing that can account for the gap. */
  reassignedCourses?: string
  /** Who holds them now. */
  reassignedTo?: string
}
