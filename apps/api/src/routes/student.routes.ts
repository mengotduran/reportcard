import { Router } from 'express'
import {
  getStudents, getStudent, createStudent, updateStudent, setStudentStatus, getClassLevels,
  downloadStudentImportTemplate, previewStudentImport, commitStudentImport,
} from '../controllers/student.controller'
import { protect, restrictTo } from '../middleware/auth'
import { uploadSpreadsheet } from '../middleware/uploadSpreadsheet'

const router = Router()

router.use(protect)

router.get('/class-levels', getClassLevels)
router.get('/import/template', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), downloadStudentImportTemplate)
router.post('/import/preview', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), uploadSpreadsheet.single('file'), previewStudentImport)
router.post('/import/commit', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), commitStudentImport)
router.get('/', getStudents)
router.get('/:id', getStudent)
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), createStudent)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL', 'CLASS_TEACHER'), updateStudent)
router.put('/:id/status', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), setStudentStatus)

export default router
