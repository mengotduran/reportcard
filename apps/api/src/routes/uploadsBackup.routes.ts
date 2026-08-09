import { Router, Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { UPLOAD_DIR } from '../config/uploads'

/**
 * Lets the nightly backup job copy the uploads folder off the server.
 *
 * WHY IT EXISTS: the database dump (see DEPLOYMENT_ARCHITECTURE.md section 19) covers rows
 * only. School logos, official stamps and cover images are FILES on a Railway volume, and
 * they are *less* recoverable than the database — a school's stamp is an original they
 * handed over, and a report card prints without its letterhead if it is gone. Nothing was
 * copying them off-platform.
 *
 * WHY A SECRET AND NOT A LOGIN: the caller is a machine (a GitHub Actions job), not a
 * person. A user JWT would mean either a long-lived token for a real account or storing a
 * password in CI, and revoking it would mean disabling someone's login. This secret can be
 * rotated on its own and belongs to nobody.
 *
 * THIS ENDPOINT CROSSES TENANTS. Every school's files are visible through it, which is
 * exactly why section 17 keeps the full-database backup route stubbed out in the cloud
 * build. It is acceptable only because it is operator-only: the secret is never issued to a
 * school, and the route disables itself when the secret is unset (see below).
 *
 *   GET /api/uploads-backup/manifest        header: x-backup-secret: <UPLOADS_BACKUP_SECRET>
 *   GET /api/uploads-backup/file/<relpath>  same header
 */
const router = Router()

/** Constant-time compare so a wrong guess leaks nothing through response timing. Length is
 *  checked first because timingSafeEqual throws on a length mismatch. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Closed by default. With no `UPLOADS_BACKUP_SECRET` set, this 503s rather than falling
 * back to "no auth required" — a misconfigured deploy must fail shut, never open, because
 * failing open here would publish every school's files to anyone who found the URL.
 */
const requireBackupSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.UPLOADS_BACKUP_SECRET
  if (!expected) {
    res.status(503).json({ message: 'Uploads backup is not configured (UPLOADS_BACKUP_SECRET unset)' })
    return
  }
  const provided = req.header('x-backup-secret') ?? ''
  if (!secretMatches(provided, expected)) {
    res.status(401).json({ message: 'Invalid backup secret' })
    return
  }
  next()
}

router.use(requireBackupSecret)

/** Every file under UPLOAD_DIR, as paths relative to it. Walks subdirectories because the
 *  offline backup already assumes the folder can be nested (section 17), even though multer
 *  currently writes flat. */
function walk(dir: string, base = ''): { name: string; size: number; mtime: string }[] {
  const out: { name: string; size: number; mtime: string }[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // an unreadable directory must not fail the whole backup
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full, rel))
    } else if (entry.isFile()) {
      const s = fs.statSync(full)
      out.push({ name: rel, size: s.size, mtime: s.mtime.toISOString() })
    }
  }
  return out
}

router.get('/manifest', (_req: Request, res: Response) => {
  const files = walk(UPLOAD_DIR)
  res.json({ files, totalBytes: files.reduce((n, f) => n + f.size, 0) })
})

/**
 * Streams one file. The path is taken from the URL, so it is hostile input: resolve it and
 * confirm the result is genuinely inside UPLOAD_DIR before opening anything. Without this,
 * `../../etc/passwd` (or a symlink pointing out of the folder) would be readable by anyone
 * holding the backup secret.
 */
router.get('/file/*name', (req: Request, res: Response) => {
  // Express 5 (path-to-regexp v8) hands a `*name` wildcard back as an ARRAY of path
  // segments, not a string. Joining is what reassembles `a/b.png`; String() on the array
  // would quietly produce `a,b.png` and 404 every nested file.
  const raw = (req.params as Record<string, string | string[]>).name
  const rel = Array.isArray(raw) ? raw.join('/') : String(raw ?? '')
  const resolved = path.resolve(UPLOAD_DIR, rel)
  const root = path.resolve(UPLOAD_DIR) + path.sep
  if (!resolved.startsWith(root)) {
    res.status(400).json({ message: 'Invalid path' })
    return
  }
  // realpath after the containment check catches a symlink inside the folder that points
  // outside it — the resolved path can look fine while the actual target does not.
  let real: string
  try {
    real = fs.realpathSync(resolved)
  } catch {
    res.status(404).json({ message: 'Not found' })
    return
  }
  if (!real.startsWith(root) || !fs.statSync(real).isFile()) {
    res.status(400).json({ message: 'Invalid path' })
    return
  }
  res.sendFile(real)
})

export default router
