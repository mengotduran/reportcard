import { Router, Request, Response } from 'express'
import { resetDemoSchool, DEMO_LOGINS } from '../scripts/seedDemo'

const router = Router()

// Public, but guarded by a shared secret so an external scheduler (cron-job.org,
// GitHub Actions, Railway cron, …) can rebuild the demo tenant on a schedule.
// Only ever touches the demo school — never any real tenant.
//
// POST /api/demo/reset   header:  x-demo-secret: <DEMO_RESET_SECRET>
router.post('/reset', async (req: Request, res: Response) => {
  const secret = process.env.DEMO_RESET_SECRET
  if (!secret) {
    res.status(503).json({ message: 'Demo reset is not configured (DEMO_RESET_SECRET unset)' })
    return
  }
  const provided = req.header('x-demo-secret') || (req.query.key as string | undefined)
  if (provided !== secret) {
    res.status(401).json({ message: 'Invalid demo secret' })
    return
  }
  try {
    const result = await resetDemoSchool()
    res.json({ message: 'Demo school reset', ...result })
  } catch (error) {
    console.error('Demo reset failed:', error)
    res.status(500).json({ message: 'Demo reset failed' })
  }
})

// Public — lets the login page surface the demo credentials without hardcoding.
router.get('/credentials', (_req: Request, res: Response) => {
  res.json({ logins: DEMO_LOGINS })
})

export default router
