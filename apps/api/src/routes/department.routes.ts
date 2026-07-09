import { Router } from 'express'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../controllers/department.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)

router.get('/', getDepartments)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createDepartment)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateDepartment)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteDepartment)

export default router
