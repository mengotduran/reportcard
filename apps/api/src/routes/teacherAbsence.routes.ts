import { Router } from 'express'
import { createAbsence, deleteAbsence, getMyAbsences, getTeacherAbsences, getAbsenceCounts, markAbsencesSeen } from '../controllers/teacherAbsence.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/me', getMyAbsences)
router.get('/counts', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getAbsenceCounts)
router.get('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getTeacherAbsences)
router.post('/mark-seen', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), markAbsencesSeen)
router.post('/', createAbsence)
router.delete('/:id', deleteAbsence)

export default router
