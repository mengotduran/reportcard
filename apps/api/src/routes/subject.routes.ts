import { Router } from 'express'
import { getSubjects, createSubject, updateSubject, deleteSubject } from '../controllers/subject.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/', getSubjects)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createSubject)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateSubject)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteSubject)

export default router
