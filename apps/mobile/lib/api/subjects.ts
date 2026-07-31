import api from './client'

export interface Subject {
  id: string
  name: string
  classLevel: string
  maxScore: number
  coefficient: number
  credit?: number | null
  term?: string | null
  requiredHours?: number | null
  code?: string | null
  /** False = optional: students can be ticked off it individually. Defaults true. */
  compulsory?: boolean
  /** How many students are ticked off this course. Always 0 while compulsory. */
  excludedCount?: number
}

export const getSubjects = async (): Promise<{ subjects: Subject[] }> => {
  const res = await api.get('/subjects')
  return res.data
}

export const createSubject = async (data: { name: string; classLevel: string; maxScore?: number; coefficient?: number; credit?: number | null; term?: string | null; requiredHours?: number | null; code?: string | null; compulsory?: boolean }) => {
  const res = await api.post('/subjects', data)
  return res.data
}

// What deleting this course would destroy, counted server-side before anything is touched.
// The screen cannot see marks, lecturer assignments or timetable slots, and those are
// exactly what makes the delete irreversible.
export interface SubjectDeleteImpact {
  name: string
  classLevel: string
  term?: string | null
  marks: number
  /** How many distinct students would lose a mark. */
  students: number
  assignments: number
  slots: number
  /** True once marks exist, which is what makes the admin type the course name. */
  requiresTypedName: boolean
}

export const getSubjectDeleteImpact = async (id: string): Promise<SubjectDeleteImpact> => {
  const res = await api.get(`/subjects/${id}/delete-impact`)
  return res.data
}

// `confirmName` is demanded by the API once the course has marks on it.
export const deleteSubject = async (id: string, confirmName?: string) => {
  const res = await api.delete(`/subjects/${id}`, confirmName ? { data: { confirmName } } : undefined)
  return res.data
}

/** Who in a course's class is NOT taking it. Optional courses only — see SubjectExclusion. */
export interface SubjectExclusions {
  subject: { id: string; name: string; classLevel: string; compulsory: boolean }
  students: { id: string; name: string; studentId: string }[]
  excludedStudentIds: string[]
  /** Students with a mark for it THIS session. Still tickable, but doing so deletes it. */
  markedStudentIds: string[]
}

export const getSubjectExclusions = async (id: string): Promise<SubjectExclusions> => {
  const res = await api.get(`/subjects/${id}/exclusions`)
  return res.data
}

export const setSubjectExclusions = async (
  id: string, studentIds: string[],
): Promise<{ excludedStudentIds: string[]; deletedMarks: number; affectedReportCards: number }> => {
  const res = await api.put(`/subjects/${id}/exclusions`, { studentIds })
  return res.data
}

export const updateSubject = async (id: string, data: { name?: string; classLevel?: string; code?: string | null; coefficient?: number; credit?: number | null; term?: string | null; requiredHours?: number | null; compulsory?: boolean }) => {
  const res = await api.put(`/subjects/${id}`, data)
  return res.data
}
