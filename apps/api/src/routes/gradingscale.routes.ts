import { Router } from 'express'
import { getGradingScale, saveGradingScale } from '../controllers/gradingscale.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getGradingScale)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), saveGradingScale)

export default router
