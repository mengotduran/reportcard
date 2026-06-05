import { Router } from 'express'
import { getDashboardStats, getWeeklyStats, getTeacherChartStats } from '../controllers/dashboard.controller'
import { protect } from '../middleware/auth'

const router = Router()

router.get('/stats', protect, getDashboardStats)
router.get('/weekly-stats', protect, getWeeklyStats)
router.get('/teacher-chart-stats', protect, getTeacherChartStats)

export default router
