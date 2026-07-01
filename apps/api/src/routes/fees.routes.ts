import { Router } from 'express'
import { getStudentFees, addPayment, deletePayment, getFeesOverview, getClassFees, addBulkPayments } from '../controllers/fees.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.use(restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'))

router.get('/overview', getFeesOverview)
router.get('/class/:classLevel', getClassFees)
router.post('/payments/bulk', addBulkPayments)
router.get('/student/:studentId', getStudentFees)
router.post('/student/:studentId/payments', addPayment)
router.delete('/payments/:paymentId', deletePayment)

export default router
