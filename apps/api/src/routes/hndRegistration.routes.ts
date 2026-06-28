import { Router } from 'express'
import {
  getHndRegistrationList,
  getStudentHndRegistration,
  addHndRegistrationPayment,
  deleteHndRegistrationPayment,
} from '../controllers/hndRegistration.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.use(restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'))

router.get('/', getHndRegistrationList)
router.get('/student/:studentId', getStudentHndRegistration)
router.post('/student/:studentId/payments', addHndRegistrationPayment)
router.delete('/payments/:paymentId', deleteHndRegistrationPayment)

export default router
