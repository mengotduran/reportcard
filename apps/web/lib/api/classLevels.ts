import api from './client'

export type Programme = 'DAY' | 'EVENING'

export interface ClassLevel {
  id: string
  name: string
  abbreviation?: string | null
  hasStream: boolean
  order: number
  maxScore: number
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

export const createClassLevelApi = async (data: { name: string; abbreviation?: string; hasStream: boolean; order?: number; maxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null; programme?: Programme }) => {
  const res = await api.post('/class-levels', data)
  return res.data
}

export const updateClassLevelApi = async (id: string, data: { name?: string; abbreviation?: string; hasStream?: boolean; order?: number; maxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null; programme?: Programme }) => {
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
