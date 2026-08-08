import { Router } from 'express'
import { getCompetencyScale, saveCompetencyScale } from '../controllers/competencyscale.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)
// Readable by any signed-in user: a teacher's rating picker and every report card screen
// need the levels, exactly as they need the grading scale.
router.get('/', getCompetencyScale)
router.put('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), saveCompetencyScale)

export default router
