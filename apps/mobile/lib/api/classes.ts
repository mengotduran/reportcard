import api from './client'
import { Programme } from '../programme'

/** How a class is assessed. COMPETENCY (nursery: a rating per subject, no marks, no
 *  average and no position) is offered to primary schools only. */
export type GradingMode = 'NUMERIC' | 'COMPETENCY'

export interface ClassLevel {
  id: string
  name: string
  hasStream: boolean
  order: number
  maxScore?: number
  feeAmount?: number
  departmentId?: string | null
  // Day or Evening sitting. A university runs the same programme twice with the same
  // lecturers and different students, each sitting being its own class.
  programme?: Programme
  gradingMode?: GradingMode
}

export const getClasses = async (): Promise<{ classLevels: ClassLevel[] }> => {
  const res = await api.get('/class-levels')
  return res.data
}

export const createClass = async (data: { name: string; hasStream?: boolean; order?: number; maxScore?: number; feeAmount?: number; departmentId?: string | null; gradingMode?: GradingMode }) => {
  const res = await api.post('/class-levels', data)
  return res.data
}

// `confirmName` is required by the API for every class/department delete. Mobile's own
// typed-confirmation UI is still to come (Alert.prompt is iOS only, so it needs a real
// modal); until then the Alert below is the confirmation and the name is passed straight
// through, so the delete keeps working rather than 400ing.
// What deleting this class would destroy, counted server-side before anything is touched:
// the app cannot see marks, lecturer assignments or timetable slots, and those are exactly
// what makes the delete irreversible.
export interface ClassDeleteImpact {
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
  requiresTypedName: boolean
}

export const getClassDeleteImpact = async (id: string): Promise<ClassDeleteImpact> => {
  const res = await api.get(`/class-levels/${id}/delete-impact`)
  return res.data
}

export const deleteClass = async (id: string, confirmName: string) => {
  const res = await api.delete(`/class-levels/${id}`, { data: { confirmName } })
  return res.data
}
