import api from './client'
import type { StudentFees } from './fees'

// The parent portal's read-only surface. Mirrors apps/web/lib/api/parent.ts — same four
// endpoints, same shapes — because both apps read the same rows and a difference between
// them would only ever be a bug.
//
// There is no write path here on purpose: a parent never edits school data. Everything
// below resolves through the caller's Guardian rows on the server, never through a school
// id, since a parent's account has none (their children can be at two schools at once).

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

export interface ParentCardEntry {
  id: string
  score: number | null
  grade: string | null
  remarks: string | null
  subject: { id: string; name: string; coefficient: number | null } | null
}

export interface ParentFullCard {
  id: string
  average: number | null
  position: number | null
  decision: string | null
  remarks: string | null
  entries: ParentCardEntry[]
  student: { name: string; classLevel: string }
  term: { name: string; session: string }
}

export const getMyChildren = async (): Promise<{ children: ParentChild[] }> => {
  const res = await api.get('/parent/children')
  return res.data
}

export const getChildReportCards = async (studentId: string): Promise<{ reportCards: ParentReportCardRow[] }> => {
  const res = await api.get(`/parent/children/${studentId}/report-cards`)
  return res.data
}

export const getChildReportCard = async (studentId: string, cardId: string): Promise<ParentFullCard> => {
  const res = await api.get(`/parent/children/${studentId}/report-cards/${cardId}`)
  // The endpoint delegates to the school-side handler, which returns the card at the top
  // level; the wrapper is tolerated in case that ever changes.
  return res.data.reportCard ?? res.data
}

export const getChildFees = async (studentId: string): Promise<StudentFees> => {
  const res = await api.get(`/parent/children/${studentId}/fees`)
  return res.data
}
