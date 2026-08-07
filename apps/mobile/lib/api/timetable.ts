import api from './client'

export interface MyTimetableSlot {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  room?: string | null
  classLevel?: string | null
  subjectId?: string | null
  subjectName?: string | null
  label?: string | null // set for a private/personal slot (subjectId is null)
  // "YYYY-MM-DD" — set only for a one-off private slot that doesn't repeat every week.
  specificDate?: string | null
  // Window for a private class that recurs weekly but only for part of the term. Both
  // null = it runs the whole term. Ignored when specificDate is set.
  startsOn?: string | null
  endsOn?: string | null
  // Course a private class delivers hours toward, if any.
  privateSubjectId?: string | null
  /** Name of that course, resolved by the API so no client refetches the subject list. */
  privateSubjectName?: string | null
  /** And its class, so a linked private class can show the same two rows a course does. */
  privateSubjectClass?: string | null
}

export const getMyTimetable = async (): Promise<{ slots: MyTimetableSlot[] }> => {
  const res = await api.get('/timetable/me')
  return res.data
}

// Admin-only (server-enforced) — a specific teacher's timetable, for the admin's
// report-absence-on-their-behalf flow.
export const getTeacherTimetable = async (teacherId: string): Promise<{ slots: MyTimetableSlot[] }> => {
  const res = await api.get('/timetable', { params: { teacherId } })
  return res.data
}

export interface TimetableHistoryVersion {
  /** ISO timestamp shared by every slot archived in one save. */
  archivedAt: string
  slots: MyTimetableSlot[]
}

/**
 * Every superseded version of a teacher's timetable, newest first. Admin-only
 * (server-enforced: SCHOOL_ADMIN / VICE_PRINCIPAL).
 *
 * Used to answer "where did that period go?" when an absence outlives the timetable it was
 * reported against — the slot is archived rather than deleted, so it is still in here.
 */
export const getTimetableHistory = async (teacherId: string): Promise<{ versions: TimetableHistoryVersion[] }> => {
  const res = await api.get('/timetable/history', { params: { teacherId } })
  return res.data
}

export interface TimetablePeriod {
  id: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export const getPeriods = async (): Promise<{ periods: TimetablePeriod[] }> => {
  const res = await api.get('/timetable/periods')
  return res.data
}
