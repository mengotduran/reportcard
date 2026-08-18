import api from './client'

export const getStudentClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data
}

export type StudentStatus = 'ACTIVE' | 'DISABLED' | 'DISMISSED'

export const getStudentsApi = async (params?: { classLevel?: string; search?: string; session?: string; status?: string }) => {
  const res = await api.get('/students', { params })
  return res.data
}

/** Set when saving attached the student to a parent who already had an account. */
export interface GuardianLinked { linked: boolean; parentName?: string }

export const createStudentApi = async (data: {
  name: string
  classLevel: string
  gender: string
  /** Optional birth details, "YYYY-MM-DD" and free text. Omitted or blank = not recorded,
   *  and the row prints blank on the report card/transcript. */
  dateOfBirth?: string
  placeOfBirth?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  directLevel2Entry?: boolean
}): Promise<{ student: unknown; guardianLinked?: GuardianLinked }> => {
  const res = await api.post('/students', data)
  return res.data
}

export const updateStudentApi = async (id: string, data: {
  name?: string
  classLevel?: string
  gender?: string
  dateOfBirth?: string
  placeOfBirth?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  directLevel2Entry?: boolean
  isRepeatingLevel?: boolean
}): Promise<{ student: unknown; guardianLinked?: GuardianLinked }> => {
  const res = await api.put(`/students/${id}`, data)
  return res.data
}

export const uploadStudentPhotoApi = async (id: string, file: File) => {
  const formData = new FormData()
  formData.append('photo', file)
  const res = await api.post(`/students/${id}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export const removeStudentPhotoApi = async (id: string) => {
  const res = await api.delete(`/students/${id}/photo`)
  return res.data
}

export const bulkPromoteStudentsApi = async (studentIds: string[]): Promise<{ promoted: number; message: string }> => {
  const res = await api.post('/students/bulk-promote', { studentIds })
  return res.data
}

// Replaces the old silent "delete" (which never deleted anything — just set
// isActive: false with no visible status and no way back). See Student.status
// in schema.prisma.
export const setStudentStatusApi = async (id: string, status: StudentStatus) => {
  const res = await api.put(`/students/${id}/status`, { status })
  return res.data
}

// For a mis-typed or duplicated row only, and admin-only. The API refuses with 409
// once the student has a report card or any payment against them, because at that
// point they are an academic record the school may have to produce years later —
// setStudentStatusApi above is the way an actual student leaves. Callers should show
// the server's message rather than a generic failure: it names what is on record and
// points at Disable/Dismiss.
export const deleteStudentApi = async (id: string) => {
  const res = await api.delete(`/students/${id}`)
  return res.data
}

export interface StudentDeletable {
  deletable: boolean
  message: string
  counts: { reportCards: number; feePayments: number; hndRegistrationPayments: number }
}

// Asked when the delete dialog opens so the button can be dead from the start with the
// reason on screen, instead of refusing after the admin has typed the whole name. The
// server answers from the same helper that enforces the delete, so the two cannot drift.
export const getStudentDeletableApi = async (id: string): Promise<StudentDeletable> => {
  const res = await api.get(`/students/${id}/deletable`)
  return res.data
}

// Bulk import — see apps/api/src/utils/studentImport.ts. Two steps: preview
// (parses + validates, writes nothing) then commit (creates only the rows
// the admin reviewed) — never re-uploads the raw file twice, so a corrected
// re-upload can't double-create the rows that already succeeded.

export interface ParsedStudentRow {
  row: number
  name: string
  classLevel: string
  gender: 'Male' | 'Female'
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  matricule?: string
  directLevel2Entry?: boolean
  feePaid?: number
  paymentDate?: string
}

export interface CarryOverRow {
  row: number
  name: string
  classLevel: string
  matricule?: string
  matchType: 'matricule' | 'name'
}

export interface ImportRowError { row: number; reason: string }

export interface ImportPreviewResult {
  valid: ParsedStudentRow[]
  errors: ImportRowError[]
  carryOvers?: CarryOverRow[]
  headerError?: string
}

export const downloadStudentImportTemplateApi = async (): Promise<Blob> => {
  const res = await api.get('/students/import/template', { responseType: 'blob' })
  return res.data
}

// `programme` is the Day/Evening filter the admin is on. The sheet has no column for the
// sitting, so this is what tells a department that runs both which one to import into.
export const previewStudentImportApi = async (file: File, programme?: string): Promise<ImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  if (programme) formData.append('programme', programme)
  const res = await api.post('/students/import/preview', formData)
  return res.data
}

export const commitStudentImportApi = async (rows: ParsedStudentRow[]): Promise<{
  created: number
  failed: { row: number; name: string; reason: string }[]
  feesRecorded: number
  feeWarning?: string
}> => {
  const res = await api.post('/students/import/commit', { rows })
  return res.data
}

// ── Guardian phone backfill ─────────────────────────────────────────────────
// Fills the guardian phone in for students who are already on the roster. The student
// importer above only creates, so it cannot be used to correct an existing row.

export const downloadGuardianPhoneSheetApi = async (classLevel?: string, missingOnly = true): Promise<Blob> => {
  const res = await api.get('/students/guardian-phones/sheet', {
    responseType: 'blob',
    params: { classLevel: classLevel && classLevel !== 'all' ? classLevel : undefined, missingOnly: missingOnly ? 1 : 0 },
  })
  return res.data
}

export interface PhoneImportChange {
  row: number
  matricule: string
  studentId: string
  name: string
  e164: string
  display: string
  current: string | null
}

export interface PhoneImportResult {
  changes: PhoneImportChange[]
  unchanged: number
  skipped: number
  errors: { row: number; matricule: string; reason: string }[]
  applied: number
}

/** `apply` false reads the file and reports what would change without writing anything. */
export const importGuardianPhonesApi = async (file: File, apply: boolean): Promise<PhoneImportResult> => {
  const formData = new FormData()
  formData.append('file', file)
  if (apply) formData.append('apply', '1')
  const res = await api.post('/students/guardian-phones/import', formData)
  return res.data
}
