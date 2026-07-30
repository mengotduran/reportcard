import api from './client'

/**
 * Where tapping a notification should lead, as recorded when it was created. See
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

export const getMyNotifications = async (): Promise<{ notifications: AppNotification[]; unreadCount: number }> => {
  const res = await api.get('/notifications')
  return res.data
}

export const markNotificationRead = async (id: string) => {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data
}

export const markAllNotificationsRead = async () => {
  const res = await api.patch('/notifications/read-all')
  return res.data
}
