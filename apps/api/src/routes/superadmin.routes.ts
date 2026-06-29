import { Router } from 'express'
import {
  getOverview, getAllSchools, getSchoolAdmins, getSchoolDetail,
  createStandaloneSchool, createParentSchool, addSectionToParent, addSectionToSchool,
  toggleSchoolActive, toggleParentSchoolActive, deleteSchool, updateSchool,
  toggleTermPrinting,
} from '../controllers/superadmin.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

router.use(protect, restrictTo('SUPERADMIN'))

router.get('/overview', getOverview)
router.get('/schools', getAllSchools)
router.get('/schools/:schoolId/admins', getSchoolAdmins)
router.get('/schools/:schoolId/detail', getSchoolDetail)

router.post('/schools', createStandaloneSchool)
router.patch('/schools/:id/toggle', toggleSchoolActive)
router.put('/schools/:id', updateSchool)
router.post('/schools/:id/sections', addSectionToSchool)
router.delete('/schools/:id', deleteSchool)

router.post('/parent-schools', createParentSchool)
router.post('/parent-schools/:id/sections', addSectionToParent)
router.patch('/parent-schools/:id/toggle', toggleParentSchoolActive)

router.patch('/terms/:termId/printing', toggleTermPrinting)

export default router
