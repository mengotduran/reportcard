import { Router, RequestHandler } from 'express'
import {
  getStudents, getStudent, createStudent, updateStudent, setStudentStatus, deleteStudent, getStudentDeletable, getClassLevels,
  bulkPromoteStudents,
  downloadStudentImportTemplate, previewStudentImport, commitStudentImport,
  uploadStudentPhoto, removeStudentPhoto,
  downloadGuardianPhoneSheet, importGuardianPhones,
} from '../controllers/student.controller'
import { protect, restrictTo } from '../middleware/auth'
import {
  createGuardianInvite, getGuardianStatus, createBulkGuardianInvites, getClassGuardianAccess,
  listGuardianRequests, approveGuardianRequest, rejectGuardianRequest,
} from '../controllers/parent.controller'
import { uploadSpreadsheet } from '../middleware/uploadSpreadsheet'
import { upload } from '../middleware/upload'
import { STUDENT_PHOTO_UPLOADS_ENABLED } from '../config/features'

const router = Router()

/**
 * Refuses a photo upload while the feature is switched off — see `config/features.ts`.
 *
 * Deliberately sits BEFORE `upload.single('photo')`: multer streams the file to disk as it
 * parses the request, so a guard placed in the controller would already have written the
 * file to `UPLOAD_DIR` before rejecting it. That would leave orphaned files behind and
 * defeat the entire point of turning this off.
 */
const requirePhotoUploadsEnabled: RequestHandler = (_req, res, next) => {
  if (!STUDENT_PHOTO_UPLOADS_ENABLED) {
    res.status(503).json({ message: 'Student photo uploads are currently disabled.' })
    return
  }
  next()
}

router.use(protect)

router.get('/class-levels', getClassLevels)
router.get('/import/template', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), downloadStudentImportTemplate)
router.post('/import/preview', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), uploadSpreadsheet.single('file'), previewStudentImport)
router.post('/import/commit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), commitStudentImport)
// Parent-portal access across a whole class, and the guardian-phone backfill it depends on.
// Registered above `/:id` so a literal first segment is never read as a student id.
const adminOnly = restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL')
router.get('/guardian-access', adminOnly, getClassGuardianAccess)
router.post('/guardian-invites/bulk', adminOnly, createBulkGuardianInvites)
router.get('/guardian-phones/sheet', adminOnly, downloadGuardianPhoneSheet)
router.post('/guardian-phones/import', adminOnly, uploadSpreadsheet.single('file'), importGuardianPhones)
// Parents who asked for access on the public sign-up form.
router.get('/guardian-requests', adminOnly, listGuardianRequests)
router.post('/guardian-requests/:id/approve', adminOnly, approveGuardianRequest)
router.post('/guardian-requests/:id/reject', adminOnly, rejectGuardianRequest)

router.get('/', getStudents)
router.get('/:id', getStudent)
router.post('/bulk-promote', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), bulkPromoteStudents)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), createStudent)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), updateStudent)
router.put('/:id/status', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setStudentStatus)
// Narrower than setting a status on purpose. Disabling or dismissing is reversible and
// is the normal way a student leaves, so a vice-principal can do it; deleting is not
// reversible and only ever cleans up a mis-typed row, so it stays with the admin. The
// controller refuses outright once the student has any record against them.
router.delete('/:id', restrictTo('SCHOOL_ADMIN'), deleteStudent)
// Read-only pre-flight for the delete dialog, so it can grey the button out and say why
// instead of refusing after the admin has typed the whole name. Same role as the delete
// itself: nobody else has any use for it.
router.get('/:id/deletable', restrictTo('SCHOOL_ADMIN'), getStudentDeletable)
router.post('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), requirePhotoUploadsEnabled, upload.single('photo'), uploadStudentPhoto)
// Removal stays enabled while uploads are off, so an already-uploaded photo can still be
// cleared (and its file deleted) rather than being stranded with no way to reclaim the space.
router.delete('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), removeStudentPhoto)

// Parent-portal access for this student's guardian. Lives here rather than under /parent
// because it is an ADMIN action on a student, and it is the admin's roles that gate it.
router.get('/:id/guardian-status', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), getGuardianStatus)
router.post('/:id/guardian-invite', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createGuardianInvite)

export default router
