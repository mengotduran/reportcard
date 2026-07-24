import api from './client'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
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
