import { Router } from 'express'
import { getTeachers, createTeacher, updateTeacher, deleteTeacher, getTeacherSubjects, assignTeacherSubjects } from '../controllers/teacher.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/', getTeachers)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createTeacher)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateTeacher)
router.delete('/:id', restrictTo('SCHOOL_ADMIN'), deleteTeacher)
router.get('/:id/subjects', getTeacherSubjects)
router.put('/:id/subjects', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), assignTeacherSubjects)

export default router
