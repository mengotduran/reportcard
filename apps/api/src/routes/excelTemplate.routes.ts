import { Router } from 'express'
import multer from 'multer'
import { protect, restrictTo } from '../middleware/auth'
import {
  listTemplates, uploadTemplate, updateTemplate,
  deleteTemplate, generateExcel, htmlPreviewTemplate, previewTemplate, downloadExampleTemplate,
} from '../controllers/excelTemplate.controller'

const router = Router()

const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.xlsx')) cb(null, true)
    else cb(new Error('Only .xlsx files are allowed'))
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

router.use(protect)

router.get('/',                                        restrictTo('SCHOOL_ADMIN'), listTemplates)
router.post('/', restrictTo('SCHOOL_ADMIN'),           uploadXlsx.single('file'), uploadTemplate)
router.put('/:id',                                     restrictTo('SCHOOL_ADMIN'), updateTemplate)
router.delete('/:id',                                  restrictTo('SCHOOL_ADMIN'), deleteTemplate)
router.get('/example',                                 restrictTo('SCHOOL_ADMIN'), downloadExampleTemplate)
router.get('/:id/preview',                             restrictTo('SCHOOL_ADMIN'), previewTemplate)
router.get('/:id/html-preview/:studentId',             htmlPreviewTemplate)
router.get('/:id/generate/:studentId',                 generateExcel)

export default router
