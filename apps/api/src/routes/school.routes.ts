import { Router } from 'express'
import { getSchoolSettings, uploadLogo, uploadCover, removeLogo, removeCover, addCoverImage, removeCoverImage } from '../controllers/school.controller'
import { protect, restrictTo } from '../middleware/auth'
import { upload } from '../middleware/upload'

const router = Router()

router.use(protect)
router.get('/settings', getSchoolSettings)
router.post('/logo', restrictTo('SCHOOL_ADMIN'), upload.single('logo'), uploadLogo)
router.post('/cover', restrictTo('SCHOOL_ADMIN'), upload.single('cover'), uploadCover)
router.delete('/logo', restrictTo('SCHOOL_ADMIN'), removeLogo)
router.delete('/cover', restrictTo('SCHOOL_ADMIN'), removeCover)
router.post('/cover-images', restrictTo('SCHOOL_ADMIN'), upload.single('image'), addCoverImage)
router.delete('/cover-images/:index', restrictTo('SCHOOL_ADMIN'), removeCoverImage)

export default router
