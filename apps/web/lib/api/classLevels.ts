import api from './client'

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
}

export const getClassLevelsApi = async (): Promise<{ classLevels: ClassLevel[] }> => {
  const res = await api.get('/class-levels')
  return res.data
}

export const createClassLevelApi = async (data: { name: string; abbreviation?: string; hasStream: boolean; order?: number; maxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null }) => {
  const res = await api.post('/class-levels', data)
  return res.data
}

export const updateClassLevelApi = async (id: string, data: { name?: string; abbreviation?: string; hasStream?: boolean; order?: number; maxScore?: number; feeAmount?: number; hndRegistrationFee?: number | null; departmentId?: string | null }) => {
  const res = await api.put(`/class-levels/${id}`, data)
  return res.data
}

export const deleteClassLevelApi = async (id: string) => {
  const res = await api.delete(`/class-levels/${id}`)
  return res.data
}
