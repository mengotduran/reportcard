// Cloud-only self-service "forgot password" flow (email delivery required).
// Excluded entirely from the offline SQLite build — see
// scripts/offline-build/stubs/passwordReset.routes.stub.ts and bundle.mjs.
import { Router } from 'express'
import { forgotPassword, resetPassword } from '../controllers/passwordReset.controller'

const router = Router()

// Public — a locked-out user has no token to authenticate with yet.
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

export default router
