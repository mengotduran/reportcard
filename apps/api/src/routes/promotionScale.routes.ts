import { Router } from 'express'
import { getPromotionScale, savePromotionScale } from '../controllers/promotionScale.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getPromotionScale)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), savePromotionScale)

export default router
