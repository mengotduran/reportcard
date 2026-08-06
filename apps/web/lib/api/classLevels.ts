import api from './client'

export type Programme = 'DAY' | 'EVENING'

export interface ClassLevel {
  id: string
  name: string
  abbreviation?: string | null
  hasStream: boolean
  order: number
  maxScore: number
  testMaxScore: number
  feeAmount: number
  hndRegistrationFee?: number | null
  departmentId?: string | null
  // Day or Evening sitting. A university runs the same programme twice with the same
  // lecturers and different students, each sitting being its own class.
  programme?: Programme
}

export const getClassLevelsApi = async (): Promise<{ classLevels: ClassLevel[] }> => {
  const res = await api.get('/class-levels')
  return res.data
}

export const createClassLevelApi = async (data: { name: string; abbreviation?: string; hasStream: boolean; order?: number; maxScore?: number; testMaxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null; programme?: Programme }) => {
  const res = await api.post('/class-levels', data)
  return res.data
}

export const updateClassLevelApi = async (id: string, data: { name?: string; abbreviation?: string; hasStream?: boolean; order?: number; maxScore?: number; testMaxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null; programme?: Programme }) => {
  const res = await api.put(`/class-levels/${id}`, data)
  return res.data
}

// What deleting this class would destroy. Counted server-side because the cascade reaches
// marks, lecturer assignments and timetable slots, none of which the Classes page loads.
export interface DeleteImpact {
  name: string
  programme?: Programme
  students: number
  subjects: number
  marks: number
  assignments: number
  slots: number
  classMasters: number
  /** Students are never deleted with a class. True means the delete is refused outright. */
  blocked: boolean
  /** True once marks would be destroyed, which is what makes the admin type the name. */
  requiresTypedName: boolean
}

export const getClassLevelDeleteImpactApi = async (id: string): Promise<DeleteImpact> => {
  const res = await api.get(`/class-levels/${id}/delete-impact`)
  return res.data
}

// `confirmName` is required by the API whenever the class still has students: it must match
// the class name exactly, so no other caller can wipe a roster with a bare DELETE.
export const deleteClassLevelApi = async (id: string, confirmName?: string) => {
  const res = await api.delete(`/class-levels/${id}`, confirmName ? { data: { confirmName } } : undefined)
  return res.data
}

// Primary-only: the class's 1-3 shared teachers, who between them teach every subject in the
// class. masterTeacherId is required unless teacherIds has exactly one entry.
export const setClassTeachersApi = async (id: string, data: { teacherIds: string[]; masterTeacherId?: string }) => {
  const res = await api.put(`/class-levels/${id}/teachers`, data)
  return res.data
}

// Primary-only: creates whichever of the 9 standard classes (Pre-Nursery through Class 6)
// don't already exist for this school yet — safe to call more than once.
export const seedDefaultPrimaryClassesApi = async (): Promise<{ message: string; created: number }> => {
  const res = await api.post('/class-levels/seed-defaults')
  return res.data
}
