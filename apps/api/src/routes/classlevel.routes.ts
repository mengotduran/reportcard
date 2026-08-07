import { Router } from 'express'
import { getClassLevels, createClassLevel, updateClassLevel, deleteClassLevel, getClassLevelDeleteImpact, setClassTeachers, removeTeacherFromClass, seedDefaultPrimaryClasses } from '../controllers/classlevel.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)

router.get('/', getClassLevels)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createClassLevel)
router.post('/seed-defaults', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), seedDefaultPrimaryClasses)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateClassLevel)
router.put('/:id/teachers', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setClassTeachers)
router.delete('/:id/teachers/:teacherId', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), removeTeacherFromClass)
router.get('/:id/delete-impact', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getClassLevelDeleteImpact)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteClassLevel)

export default router
