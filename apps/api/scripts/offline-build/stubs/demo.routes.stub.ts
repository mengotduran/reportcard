// Stand-in for routes/demo.routes in the offline build. The recruiter demo
// tenant is a cloud-only feature (see config/demo.ts, scripts/seedDemo.ts) —
// an offline single-school install has no use for it, so it's excluded
// entirely rather than bundled and left dormant (see bundle.mjs for why
// dormant isn't safe: a require.main===module guard in seedDemo.ts would
// auto-run on every offline-server startup once esbuild flattens it in).
import { Router } from 'express'

const router = Router()
export default router
