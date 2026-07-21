import { Router } from 'express'
import { getTeacherTimetable, getMyTimetable, saveTimetable, getPeriods, savePeriods, getSchoolTimetable } from '../controllers/timetable.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/periods', getPeriods)
router.put('/periods', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), savePeriods)
router.get('/me', getMyTimetable)
router.get('/school', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getSchoolTimetable)
router.get('/', getTeacherTimetable)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), saveTimetable)

export default router
