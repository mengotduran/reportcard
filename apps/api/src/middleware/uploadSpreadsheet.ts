import multer from 'multer'
import path from 'path'

// Student-import spreadsheets are parsed in memory and never written to disk —
// unlike upload.ts (school logo/cover images), nothing here needs to persist.
const storage = multer.memoryStorage()

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.xlsx', '.csv']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowed.includes(ext)) cb(null, true)
  else cb(new Error('Only .xlsx or .csv files are allowed'))
}

export const uploadSpreadsheet = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })
