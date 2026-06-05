import { Router } from 'express'
import { getStudents, getStudent, createStudent, updateStudent, deleteStudent, getClassLevels } from '../controllers/student.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)

router.get('/class-levels', getClassLevels)
router.get('/', getStudents)
router.get('/:id', getStudent)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), createStudent)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), updateStudent)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteStudent)

export default router
