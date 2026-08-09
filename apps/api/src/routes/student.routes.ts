import { Router, RequestHandler } from 'express'
import {
  getStudents, getStudent, createStudent, updateStudent, setStudentStatus, getClassLevels,
  bulkPromoteStudents,
  downloadStudentImportTemplate, previewStudentImport, commitStudentImport,
  uploadStudentPhoto, removeStudentPhoto,
} from '../controllers/student.controller'
import { protect, restrictTo } from '../middleware/auth'
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
router.get('/', getStudents)
router.get('/:id', getStudent)
router.post('/bulk-promote', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), bulkPromoteStudents)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), createStudent)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), updateStudent)
router.put('/:id/status', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setStudentStatus)
router.post('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), requirePhotoUploadsEnabled, upload.single('photo'), uploadStudentPhoto)
// Removal stays enabled while uploads are off, so an already-uploaded photo can still be
// cleared (and its file deleted) rather than being stranded with no way to reclaim the space.
router.delete('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), removeStudentPhoto)

export default router
