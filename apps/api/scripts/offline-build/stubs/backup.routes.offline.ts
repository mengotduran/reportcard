// Real backup implementation for the offline build — swapped in for the
// cloud-safe stub at src/routes/backup.routes.ts (see bundle.mjs). Safe
// here specifically because an offline install is single-tenant: the
// whole database file IS this one school's data, nothing else's.
import { Router, Request, Response } from 'express'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { protect, restrictTo } from '../../../src/middleware/auth'
import { buildZip, ZipEntry } from '../../../src/utils/zip'

const router = Router()
router.use(protect)
router.use(restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'))

function walkFiles(dir: string, baseDir: string = dir): ZipEntry[] {
  if (!fs.existsSync(dir)) return []
  const entries: ZipEntry[] = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      entries.push(...walkFiles(full, baseDir))
    } else {
      entries.push({ name: path.relative(baseDir, full), content: fs.readFileSync(full) })
    }
  }
  return entries
}

router.get('/download', async (req: Request, res: Response) => {
  const dbPath = (process.env.DATABASE_URL ?? '').replace(/^file:/, '')
  if (!dbPath) {
    res.status(500).json({ message: 'DATABASE_URL is not set — cannot locate the database to back up.' })
    return
  }

  const tempBackupPath = path.join(os.tmpdir(), `reportcard-backup-${Date.now()}.db`)
  try {
    // SQLite's actual Online Backup API (not a raw file copy) — produces a
    // consistent snapshot safely even while the live server has the
    // database open with active connections/in-flight writes.
    const db = new Database(dbPath, { readonly: true })
    await db.backup(tempBackupPath)
    db.close()

    const entries: ZipEntry[] = [
      { name: 'data.db', content: fs.readFileSync(tempBackupPath) },
      ...walkFiles(process.env.UPLOAD_DIR ?? '').map((e) => ({ ...e, name: path.join('uploads', e.name) })),
    ]
    const zip = buildZip(entries)

    const dateStamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="reportcard-backup-${dateStamp}.zip"`)
    res.send(zip)
  } catch (error) {
    console.error('Backup failed:', error)
    res.status(500).json({ message: 'Backup failed.' })
  } finally {
    fs.rmSync(tempBackupPath, { force: true })
  }
})

export default router
