import { Router } from 'express'
import { getDashboardStats, getWeeklyStats, getTeacherChartStats, getAcademicYears, getTeacherClasses } from '../controllers/dashboard.controller'
import { protect } from '../middleware/auth'

const router = Router()

router.get('/stats', protect, getDashboardStats)
router.get('/academic-years', protect, getAcademicYears)
router.get('/weekly-stats', protect, getWeeklyStats)
router.get('/teacher-chart-stats', protect, getTeacherChartStats)
router.get('/teacher-classes', protect, getTeacherClasses)

export default router
