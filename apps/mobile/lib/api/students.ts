import api from './client'

export type StudentStatus = 'ACTIVE' | 'DISABLED' | 'DISMISSED'

export interface Student {
  id: string
  name: string
  studentId: string
  classLevel: string
  gender: string | null
  guardianName: string | null
  isActive: boolean
  status?: StudentStatus
}

export const getStudents = async (params?: {
  classLevel?: string; search?: string; session?: string; status?: string
  /** 'DAY' | 'EVENING'. Server-side because the roster is paginated. */
  programme?: string
  page?: number; pageSize?: number
}): Promise<{ students: Student[]; total: number; page?: number; pageSize?: number; hasMore?: boolean }> => {
  const res = await api.get('/students', { params })
  return res.data
}

/** dateOfBirth is "YYYY-MM-DD"; both birth fields are optional and print blank when
 *  not recorded. The API normalises them (see student.controller). */
export const createStudent = async (data: { name: string; classLevel: string; gender: string; guardianName?: string; dateOfBirth?: string; placeOfBirth?: string }) => {
  const res = await api.post('/students', data)
  return res.data
}

export const updateStudent = async (id: string, data: Partial<{ name: string; classLevel: string; guardianName: string | null; isActive: boolean }>) => {
  const res = await api.put(`/students/${id}`, data)
  return res.data
}

// Replaces the old silent "delete" (which never deleted anything — just set
// isActive: false with no visible status and no way back). See
// Student.status in schema.prisma.
export const setStudentStatus = async (id: string, status: StudentStatus) => {
  const res = await api.put(`/students/${id}/status`, { status })
  return res.data
}

// For a mis-typed or duplicated row only, and admin-only. The API refuses with 409
// once the student has a report card or any payment against them, because at that
// point they are an academic record the school may have to produce years later —
// setStudentStatus above is the way an actual student leaves. Show the server's
// message rather than a generic failure: it names what is on record and points at
// Change Status.
export const deleteStudent = async (id: string) => {
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
export const getStudentDeletable = async (id: string): Promise<StudentDeletable> => {
  const res = await api.get(`/students/${id}/deletable`)
  return res.data
}

// Bulk import — mirrors apps/web/lib/api/students.ts. Two-step flow:
// preview (parse + validate, no DB writes) then commit (create only the
// reviewed rows). The API is the same endpoint as the web; only the
// FormData construction differs (mobile uses a URI-based file object).

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

export const downloadStudentImportTemplate = async (): Promise<string> => {
  // Returns the raw download URL — the caller opens it via Linking.openURL
  // so the OS handles saving the file (no expo-file-system needed).
  const baseUrl = (api.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = api.defaults.headers.common?.['Authorization'] ?? ''
  return `${baseUrl}/students/import/template?token=${encodeURIComponent(String(token).replace('Bearer ', ''))}`
}

// `programme` is the Day/Evening filter the admin is on. The sheet has no column for the
// sitting, so this is what tells a department that runs both which one to import into.
export const previewStudentImportApi = async (fileUri: string, fileName: string, mimeType: string, programme?: string): Promise<ImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', { uri: fileUri, name: fileName, type: mimeType } as any)
  if (programme) formData.append('programme', programme)
  const res = await api.post('/students/import/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
