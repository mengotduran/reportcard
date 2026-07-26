import { Router } from 'express'
import { getPastTermGrant, setPastTermGrant } from '../controllers/pastTermGrant.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
router.get('/', getPastTermGrant)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setPastTermGrant)

export default router
