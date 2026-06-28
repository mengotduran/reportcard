import { Router, Request, Response } from 'express'

// Default (cloud) implementation — a full database dump only makes sense
// for a single-tenant SQLite offline install; doing this against the
// shared multi-tenant Postgres would be a serious cross-tenant data
// exposure risk, so this is a stub here, not a real endpoint. The offline
// build's bundler swaps this import for the real implementation — see
// scripts/offline-build/bundle.mjs and stubs/backup.routes.offline.ts.
const router = Router()

router.get('/download', (_req: Request, res: Response) => {
  res.status(503).json({ message: 'Backup is only available for offline installs.' })
})

export default router
