import api from './client'
import type { StudentFees } from './fees'

export interface ParentChild {
  id: string
  name: string
  studentCode: string
  className: string
  photo: string | null
  active: boolean
  status: 'ACTIVE' | 'DISABLED' | 'DISMISSED'
  school: { id: string; name: string; type: 'PRIMARY' | 'SECONDARY' | 'UNIVERSITY'; logo: string | null }
  publishedCards: number
  lastCardAt: string | null
}

export interface ParentReportCardRow {
  id: string
  average: number | null
  position: number | null
  totalStudents: number | null
  decision: string | null
  status: 'PUBLISHED'
  updatedAt: string
  term: { id: string; name: string; session: string; startDate: string }
}

export interface ClaimPreview {
  studentName: string
  className: string
  schoolName: string
  expiresAt: string
  /** Which contact this invite was delivered to, and therefore what they sign in with. */
  loginWith: 'email' | 'phone'
  loginIdentifier: string
}

/** Both claim endpoints are public — the token in the URL is the only credential a parent
 *  has before their account exists. */
export const previewClaimApi = async (token: string): Promise<ClaimPreview> => {
  const res = await api.get(`/parent/claim/${token}`)
  return res.data
}

export const claimInviteApi = async (body: { token: string; password: string; name?: string }) => {
  const res = await api.post('/parent/claim', body)
  return res.data
}

export const getMyChildrenApi = async (): Promise<{ children: ParentChild[] }> => {
  const res = await api.get('/parent/children')
  return res.data
}

export const getChildReportCardsApi = async (studentId: string): Promise<{ reportCards: ParentReportCardRow[] }> => {
  const res = await api.get(`/parent/children/${studentId}/report-cards`)
  return res.data
}

export const getChildReportCardApi = async (studentId: string, cardId: string) => {
  const res = await api.get(`/parent/children/${studentId}/report-cards/${cardId}`)
  return res.data
}

export const getChildFeesApi = async (studentId: string): Promise<StudentFees> => {
  const res = await api.get(`/parent/children/${studentId}/fees`)
  return res.data
}

// ── Admin side ──────────────────────────────────────────────────────────────

export interface GuardianStatus {
  linked: { name: string; phone: string; since: string } | null
  pendingInvite: { createdAt: string; expiresAt: string } | null
  canInvite: boolean
  phoneProblem: string | null
}

export const getGuardianStatusApi = async (studentId: string): Promise<GuardianStatus> => {
  const res = await api.get(`/students/${studentId}/guardian-status`)
  return res.data
}

export interface GuardianInvite {
  inviteId: string
  expiresAt: string
  phone: string
  phoneDisplay: string
  link: string
  whatsappUrl: string
}

export const createGuardianInviteApi = async (studentId: string): Promise<GuardianInvite> => {
  const res = await api.post(`/students/${studentId}/guardian-invite`)
  return res.data
}

// ── A whole class at once ───────────────────────────────────────────────────

export interface ClassGuardianRow {
  studentId: string
  name: string
  className: string
  linked: boolean
  pendingInvite: boolean
  phoneDisplay: string | null
  phoneProblem: string | null
}

export interface ClassGuardianAccess {
  students: ClassGuardianRow[]
  counts: { total: number; linked: number; ready: number; noPhone: number }
}

export const getClassGuardianAccessApi = async (classLevel: string): Promise<ClassGuardianAccess> => {
  const res = await api.get('/students/guardian-access', { params: { classLevel } })
  return res.data
}

export interface BulkInviteRow {
  studentId: string
  name: string
  className: string
  inviteId: string
  phone: string
  phoneDisplay: string
  link: string
  whatsappUrl: string
}

export interface BulkInviteResult {
  invites: BulkInviteRow[]
  skipped: { studentId: string; name: string; reason: string }[]
  total: number
  expiresAt: string
}

export const createBulkGuardianInvitesApi = async (
  body: { classLevel?: string; studentIds?: string[]; includeLinked?: boolean },
): Promise<BulkInviteResult> => {
  const res = await api.post('/students/guardian-invites/bulk', body)
  return res.data
}

// ── Public sign-up: a parent asking for access themselves ───────────────────

export interface SignupSchool { id: string; name: string; type: 'PRIMARY' | 'SECONDARY' | 'UNIVERSITY' }

export const listSignupSchoolsApi = async (): Promise<{ schools: SignupSchool[] }> => {
  const res = await api.get('/parent/schools')
  return res.data
}

export const listSignupClassesApi = async (schoolId: string): Promise<{ classes: string[] }> => {
  const res = await api.get(`/parent/schools/${schoolId}/classes`)
  return res.data
}

export const requestGuardianAccessApi = async (body: {
  schoolId: string
  studentName: string
  classLevel: string
  contact: string
  parentName?: string
}): Promise<{ message: string }> => {
  const res = await api.post('/parent/request-access', body)
  return res.data
}

// ── The school's queue of those requests ────────────────────────────────────

export interface GuardianRequest {
  id: string
  studentName: string
  classLevel: string
  parentName: string | null
  email: string | null
  phone: string | null
  phoneDisplay: string | null
  matched: boolean
  status: 'PENDING' | 'SENT' | 'REJECTED'
  createdAt: string
  resolvable: boolean
  student: { id: string; name: string; classLevel: string; guardianPhone: string | null; guardianEmail: string | null } | null
}

export const getGuardianRequestsApi = async (status: 'PENDING' | 'SENT' | 'REJECTED' | 'ALL' = 'PENDING'): Promise<{
  requests: GuardianRequest[]
  pending: number
}> => {
  const res = await api.get('/students/guardian-requests', { params: { status } })
  return res.data
}

export interface ApproveResult {
  message: string
  /** An email request is delivered by the server; a phone one comes back for the admin to tap. */
  sent: 'email' | 'whatsapp'
  link?: string
  phoneDisplay?: string
  whatsappUrl?: string
}

export const approveGuardianRequestApi = async (id: string, studentId?: string): Promise<ApproveResult> => {
  const res = await api.post(`/students/guardian-requests/${id}/approve`, studentId ? { studentId } : {})
  return res.data
}

export const rejectGuardianRequestApi = async (id: string): Promise<{ message: string }> => {
  const res = await api.post(`/students/guardian-requests/${id}/reject`)
  return res.data
}
