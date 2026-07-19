// Stand-in for routes/passwordReset.routes in the offline build. Forgot-password
// requires emailing a reset link, which an offline single-school install has no
// way to do — excluded entirely rather than bundled and left dead (same reasoning
// as demo.routes.stub.ts). Offline installs keep today's admin-driven password
// reset, plus the self-service "change password" endpoint in auth.routes, which
// needs no email and works the same both online and offline.
import { Router } from 'express'

const router = Router()
export default router
