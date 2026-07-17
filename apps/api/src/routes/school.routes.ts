import { Router } from 'express'
import { getSchoolSettings, updateSchoolSettings, uploadLogo, uploadCover, removeLogo, removeCover, addCoverImage, removeCoverImage, uploadStamp, removeStamp } from '../controllers/school.controller'
import { protect, restrictTo } from '../middleware/auth'
import { upload } from '../middleware/upload'

const router = Router()

router.use(protect)
router.get('/settings', getSchoolSettings)
router.put('/settings', restrictTo('SCHOOL_ADMIN'), updateSchoolSettings)
router.post('/logo', restrictTo('SCHOOL_ADMIN'), upload.single('logo'), uploadLogo)
router.post('/cover', restrictTo('SCHOOL_ADMIN'), upload.single('cover'), uploadCover)
router.delete('/logo', restrictTo('SCHOOL_ADMIN'), removeLogo)
// Official stamp/seal — prints on OFFICIAL copies only (see the `stamp` designer section)
router.post('/stamp', restrictTo('SCHOOL_ADMIN'), upload.single('stamp'), uploadStamp)
router.delete('/stamp', restrictTo('SCHOOL_ADMIN'), removeStamp)
router.delete('/cover', restrictTo('SCHOOL_ADMIN'), removeCover)
router.post('/cover-images', restrictTo('SCHOOL_ADMIN'), upload.single('image'), addCoverImage)
router.delete('/cover-images/:index', restrictTo('SCHOOL_ADMIN'), removeCoverImage)

export default router
