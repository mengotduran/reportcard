import { Router } from 'express'
import { getClassLevels, createClassLevel, updateClassLevel, deleteClassLevel } from '../controllers/classlevel.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)

router.get('/', getClassLevels)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createClassLevel)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateClassLevel)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteClassLevel)

export default router
