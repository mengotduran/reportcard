import { Router } from 'express'
import {
  getReportCards, getReportCard, createReportCard,
  saveEntries, updateRemarks, generateRemarks, publishReportCard, unpublishReportCard,
  grantEditPermission, revokeEditPermission, bulkPublish,
  getClassOverview, getClassReadiness, getReadinessDetail,
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
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER'), createReportCard)
router.put('/:id/entries', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER'), saveEntries)
router.put('/:id/remarks', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_MASTER'), updateRemarks)
router.post('/:id/generate-remarks', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_MASTER'), generateRemarks)
router.put('/:id/publish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), publishReportCard)
router.put('/:id/unpublish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), unpublishReportCard)
router.post('/bulk-publish', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), bulkPublish)
router.put('/:id/grant-edit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), grantEditPermission)
router.put('/:id/revoke-edit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), revokeEditPermission)

// There is deliberately NO delete route for a report card. A card is an issued document:
// once published, a parent may be holding a printed copy, and deleting the school's copy
// does not recall theirs — it only makes the school's record disagree with the paper in
// their hand, with nothing left to show it ever existed. Corrections go through unpublish
// (above) and re-entry, which keeps the record and its history.
//
// A card is also auto-created for every active student when a term opens, so deleting one
// for an active student was never permanent anyway. See §Students in DOCUMENTATION.md for
// the same reasoning applied to students themselves.

export default router
