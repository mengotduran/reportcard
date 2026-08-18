import { Router } from 'express'
import {
  previewClaim, claimInvite,
  getMyChildren, getChildReportCards, getChildReportCard, getChildFees,
  listSchoolsForSignup, listClassesForSignup, requestGuardianAccess,
} from '../controllers/parent.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()

// Public: a parent redeeming an invite has no account yet, so the token in the URL is the
// only credential there can be. Both handlers reveal nothing without a live token.
router.get('/claim/:token', previewClaim)
router.post('/claim', claimInvite)

// The public sign-up form: a parent asking for access rather than waiting to be sent a
// link. Public by necessity for the same reason — they have no account yet. The two
// listing routes expose nothing a school brochure does not, and request-access answers
// identically whatever it finds, so none of the three can be used to probe the roster.
router.get('/schools', listSchoolsForSignup)
router.get('/schools/:id/classes', listClassesForSignup)
router.post('/request-access', requestGuardianAccess)

// Everything below is a signed-in parent reading their OWN children. There is deliberately no
// write route here: a parent never edits school data, so the whole surface is read-only apart
// from claiming an account above.
router.use(protect, restrictTo('PARENT'))
router.get('/children', getMyChildren)
router.get('/children/:studentId/report-cards', getChildReportCards)
router.get('/children/:studentId/report-cards/:cardId', getChildReportCard)
router.get('/children/:studentId/fees', getChildFees)

export default router
