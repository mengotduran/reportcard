import { Router } from 'express'
import { getTerms, getCurrentTerm, createTerm, updateTerm, setCurrentTerm, deleteTerm, endAcademicYear, startNewAcademicYear } from '../controllers/term.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/current', getCurrentTerm)
router.get('/', getTerms)
router.post('/end-year', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), endAcademicYear)
router.post('/new-year', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), startNewAcademicYear)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createTerm)
router.put('/:id/set-current', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setCurrentTerm)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateTerm)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteTerm)

export default router
