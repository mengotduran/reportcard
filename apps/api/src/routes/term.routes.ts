import { Router } from 'express'
import { getTerms, getCurrentTerm, createTerm, updateTerm, setCurrentTerm, deleteTerm } from '../controllers/term.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/current', getCurrentTerm)
router.get('/', getTerms)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createTerm)
router.put('/:id/set-current', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setCurrentTerm)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateTerm)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteTerm)

export default router
