import { Router } from 'express'
import {
  getReportCards, getReportCard, createReportCard,
  saveEntries, updateRemarks, generateRemarks, publishReportCard, unpublishReportCard,
  grantEditPermission, revokeEditPermission, bulkPublish,
  deleteReportCard, getClassOverview, getClassReadiness, getReadinessDetail,
  getMarksExport, getStudentTranscript
} from '../controllers/reportcard.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect)
router.get('/class-overview', getClassOverview)
router.get('/student/:studentId/transcript', getStudentTranscript)
router.get('/marks-export', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getMarksExport)
router.get('/class-readiness', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getClassReadiness)
router.get('/:id/readiness-detail', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getReadinessDetail)
router.get('/', getReportCards)
router.get('/:id', getReportCard)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER', 'CLASS_MASTER'), createReportCard)
router.put('/:id/entries', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER', 'CLASS_MASTER'), saveEntries)
router.put('/:id/remarks', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_MASTER'), updateRemarks)
router.post('/:id/generate-remarks', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_MASTER'), generateRemarks)
router.put('/:id/publish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), publishReportCard)
router.put('/:id/unpublish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), unpublishReportCard)
router.post('/bulk-publish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), bulkPublish)
router.put('/:id/grant-edit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), grantEditPermission)
router.put('/:id/revoke-edit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), revokeEditPermission)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteReportCard)

export default router
