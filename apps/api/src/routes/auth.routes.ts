import { Router } from 'express'
import { registerSchool, login, getMe, createSuperAdmin, resetSuperAdminPassword, resetUserPassword } from '../controllers/auth.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.post('/register', protect, restrictTo('SUPERADMIN'), registerSchool)
router.post('/login', login)
router.get('/me', protect, getMe)
router.post('/create-superadmin', createSuperAdmin)
router.post('/reset-superadmin', resetSuperAdminPassword)
router.put('/users/:userId/reset-password', protect, restrictTo('SUPERADMIN', 'SCHOOL_ADMIN', 'VICE_PRINCIPAL'), resetUserPassword)

export default router
