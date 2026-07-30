import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { emitToUser } from '../config/socket'

// In-app inbox only (see schema.prisma comment on Notification) — no push/email here.
const LIST_LIMIT = 50

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const recipientId = req.user!.id
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      prisma.notification.count({ where: { recipientId, readAt: null } }),
    ])
    res.json({ notifications, unreadCount })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const recipientId = req.user!.id
    const notification = await prisma.notification.findFirst({ where: { id, recipientId } })
    if (!notification) { res.status(404).json({ message: 'Notification not found' }); return }
    const wasUnread = notification.readAt == null
    const updated = await prisma.notification.update({ where: { id }, data: { readAt: notification.readAt ?? new Date() } })
    // Reading one CHANGES THE UNREAD COUNT, so the bell has to hear about it too. The page
    // the user is looking at updates itself optimistically, but the badge lives in the layout
    // (and on their other devices), and without this it only caught up on the slow fallback
    // poll — the count sat there stale while the list beside it showed everything read.
    // Only when it actually changed: re-reading a read notification is a no-op.
    if (wasUnread) emitToUser(recipientId, 'notifications:changed')
    res.json({ notification: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const recipientId = req.user!.id
    const { count } = await prisma.notification.updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } })
    if (count > 0) emitToUser(recipientId, 'notifications:changed')
    res.json({ message: 'All notifications marked read' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
