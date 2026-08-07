import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { emitToUser } from '../config/socket'
import { markTeacherAbsencesSeen } from './teacherAbsence.controller'

// In-app inbox only (see schema.prisma comment on Notification) — no push/email here.
const LIST_LIMIT = 50

// TEACHER_ABSENCE notifications are only ever sent to admins (see createAbsence), so
// whoever reads one is, by construction, exactly who markTeacherAbsencesSeen is for — no
// extra role check needed. Reading the notification is treated as reviewing the teacher's
// whole current record, same scope as opening their timetable — see markTeacherAbsencesSeen.
async function markLinkedAbsenceSeen(schoolId: string, type: string, data: unknown) {
  if (type !== 'TEACHER_ABSENCE') return
  const teacherId = (data as { teacherId?: string } | null)?.teacherId
  if (teacherId) await markTeacherAbsencesSeen(schoolId, teacherId)
}

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
    if (wasUnread) {
      emitToUser(recipientId, 'notifications:changed')
      // An admin who READS the notification has reviewed the absence it describes, whether
      // or not they go on to open the teacher's timetable. See markLinkedAbsenceSeen.
      if (req.user!.schoolId) await markLinkedAbsenceSeen(req.user!.schoolId, notification.type, notification.data)
    }
    res.json({ notification: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const recipientId = req.user!.id
    const schoolId = req.user!.schoolId
    // Fetched before the update (not derived from the updateMany count) because reviewing
    // the absences those notifications describe needs to know WHICH ones they were.
    const unread = await prisma.notification.findMany({
      where: { recipientId, readAt: null },
      select: { type: true, data: true },
    })
    if (unread.length === 0) { res.json({ message: 'All notifications marked read' }); return }
    await prisma.notification.updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } })
    emitToUser(recipientId, 'notifications:changed')
    if (schoolId) {
      // One call per distinct teacher, not per notification — several unread absence
      // notifications for the same teacher only need reviewing once.
      const teacherIds = new Set(
        unread
          .filter((n) => n.type === 'TEACHER_ABSENCE')
          .map((n) => (n.data as { teacherId?: string } | null)?.teacherId)
          .filter((tid): tid is string => !!tid),
      )
      await Promise.all([...teacherIds].map((teacherId) => markTeacherAbsencesSeen(schoolId, teacherId)))
    }
    res.json({ message: 'All notifications marked read' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
