import { Router } from 'express'
import { getTemplate, saveTemplate } from '../controllers/reportcardtemplate.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getTemplate)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), saveTemplate)

export default router
