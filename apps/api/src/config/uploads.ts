import path from 'path'
import fs from 'fs'

// In production, set UPLOAD_DIR to a persistent volume mount (e.g. /data/uploads on Railway)
// so uploaded images survive redeploys. Defaults to apps/api/uploads for local dev.
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '../../uploads')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
