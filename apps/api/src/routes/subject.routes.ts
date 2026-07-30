import { Router } from 'express'
import { getSubjects, createSubject, updateSubject, deleteSubject, copySubjects, getSubjectDeleteImpact } from '../controllers/subject.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/', getSubjects)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createSubject)
router.post('/copy', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), copySubjects)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateSubject)
router.get('/:id/delete-impact', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getSubjectDeleteImpact)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteSubject)

export default router
