import { Router } from 'express'
import {
  getStudents, getStudent, createStudent, updateStudent, setStudentStatus, getClassLevels,
  bulkPromoteStudents,
  downloadStudentImportTemplate, previewStudentImport, commitStudentImport,
  uploadStudentPhoto, removeStudentPhoto,
} from '../controllers/student.controller'
import { protect, restrictTo } from '../middleware/auth'
import { uploadSpreadsheet } from '../middleware/uploadSpreadsheet'
import { upload } from '../middleware/upload'

const router = Router()

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
router.post('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), upload.single('photo'), uploadStudentPhoto)
router.delete('/:id/photo', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), removeStudentPhoto)

export default router
