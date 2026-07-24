import { Router } from 'express'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notification.controller'
import { protect } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getMyNotifications)
router.patch('/:id/read', markNotificationRead)
router.patch('/read-all', markAllNotificationsRead)

export default router
