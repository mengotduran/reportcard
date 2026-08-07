import api from './client'

export const getSubjectsApi = async () => {
  const res = await api.get('/subjects')
  return res.data
}

export const createSubjectApi = async (data: { name: string; classLevel: string; code?: string | null; coefficient?: number; credit?: number | null; term?: string | null; requiredHours?: number | null; compulsory?: boolean }) => {
  const res = await api.post('/subjects', data)
  return res.data
}

export const updateSubjectApi = async (id: string, data: { name?: string; classLevel?: string; code?: string | null; coefficient?: number; credit?: number | null; term?: string | null; requiredHours?: number | null; compulsory?: boolean }) => {
  const res = await api.put(`/subjects/${id}`, data)
  return res.data
}

// What deleting this course would destroy, counted server-side before anything is touched.
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

export const getSubjectDeleteImpactApi = async (id: string): Promise<SubjectDeleteImpact> => {
  const res = await api.get(`/subjects/${id}/delete-impact`)
  return res.data
}

// `confirmName` is demanded by the API once the course has marks on it.
export const deleteSubjectApiWithConfirm = async (id: string, confirmName?: string) => {
  const res = await api.delete(`/subjects/${id}`, confirmName ? { data: { confirmName } } : undefined)
  return res.data
}

export const deleteSubjectApi = async (id: string) => {
  const res = await api.delete(`/subjects/${id}`)
  return res.data
}

// `subjectIds` copies only those courses; omitted copies the whole class's list.
export const copySubjectsApi = async (fromClassLevel: string, toClassLevel: string, subjectIds?: string[]): Promise<{ copied: number }> => {
  const res = await api.post('/subjects/copy', { fromClassLevel, toClassLevel, ...(subjectIds ? { subjectIds } : {}) })
  return res.data
}

/** Who in a course's class is NOT taking it. Optional courses only — see SubjectExclusion. */
export interface SubjectExclusions {
  subject: { id: string; name: string; classLevel: string; compulsory: boolean }
  students: { id: string; name: string; studentId: string }[]
  excludedStudentIds: string[]
  /** Students who already have a mark for it, so they cannot be ticked off. */
  markedStudentIds: string[]
}

export const getSubjectExclusionsApi = async (id: string): Promise<SubjectExclusions> => {
  const res = await api.get(`/subjects/${id}/exclusions`)
  return res.data
}

export const setSubjectExclusionsApi = async (id: string, studentIds: string[]) => {
  const res = await api.put(`/subjects/${id}/exclusions`, { studentIds })
  return res.data
}
