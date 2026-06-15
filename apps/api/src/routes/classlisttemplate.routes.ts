import { Router } from 'express'
import { getClassListTemplate, saveClassListTemplate } from '../controllers/classlisttemplate.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getClassListTemplate)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), saveClassListTemplate)

export default router
