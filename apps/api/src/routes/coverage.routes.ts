import { Router } from 'express'
import { getMyCoverage, getCoverage, getTeacherHoursTotals } from '../controllers/coverage.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/me', getMyCoverage)
router.get('/hours-totals', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getTeacherHoursTotals)
router.get('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getCoverage)

export default router
