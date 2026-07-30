import api from './client'

/**
 * Where clicking a notification should lead, as recorded when it was created. See
 * AbsenceNotificationLink in the API's teacherAbsence.controller for why it is stored
 * rather than resolved on read.
 *
 * Every field is optional: older notifications have no link at all, and a report covering
 * several periods carries the span instead of one period's slot and times.
 */
export interface NotificationLink {
  teacherId?: string
  teacherName?: string
  timetableSlotId?: string
  date?: string
  startTime?: string
  endTime?: string
  dateFrom?: string
  dateTo?: string
  periods?: number
  retracted?: boolean
  /** Courses that moved to another teacher, and who has them now. */
  reassignedCourses?: string
  reassignedTo?: string
}

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  /** Null on kinds with nowhere to go, and on every row written before links existed. */
  data: NotificationLink | null
  readAt: string | null
  createdAt: string
}

/**
 * The timetable URL a notification opens, or null when it has nothing to point at (which is
 * what makes a row clickable or not).
 *
 * `ownUserId` decides which timetable: the viewer's own when the absence is theirs (an
 * admin logged or removed it for them), the read-only view of that teacher's when it isn't.
 */
export function notificationHref(link: NotificationLink | null, ownUserId?: string): string | null {
  if (!link?.teacherId) return null
  const q = new URLSearchParams()
  if (link.timetableSlotId) {
    q.set('missedSlotId', link.timetableSlotId)
    if (link.date) q.set('missedDate', link.date)
    if (link.startTime) q.set('missedFrom', link.startTime)
    if (link.endTime) q.set('missedTo', link.endTime)
  } else if (link.periods && link.dateFrom && link.dateTo) {
    q.set('missedPeriods', String(link.periods))
    q.set('missedDateFrom', link.dateFrom)
    q.set('missedDateTo', link.dateTo)
  } else if (link.reassignedCourses) {
    q.set('reassignedCourses', link.reassignedCourses)
    if (link.reassignedTo) q.set('reassignedTo', link.reassignedTo)
  } else {
    // A link with no period, span or reassignment has nothing to say on the grid.
    return null
  }
  if (link.retracted) q.set('missedRetracted', '1')
  if (link.teacherId === ownUserId) return `/my-timetable?${q}`
  q.set('teacherId', link.teacherId)
  if (link.teacherName) q.set('teacherName', link.teacherName)
  return `/teacher-timetable?${q}`
}

export const getMyNotificationsApi = async (): Promise<{ notifications: AppNotification[]; unreadCount: number }> => {
  const res = await api.get('/notifications')
  return res.data
}

export const markNotificationReadApi = async (id: string) => {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data
}

export const markAllNotificationsReadApi = async () => {
  const res = await api.patch('/notifications/read-all')
  return res.data
}
