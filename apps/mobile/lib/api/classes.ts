import api from './client'

export interface ClassLevel {
  id: string
  name: string
  hasStream: boolean
  order: number
}

export const getClasses = async (): Promise<{ classLevels: ClassLevel[] }> => {
  const res = await api.get('/class-levels')
  return res.data
}

export const createClass = async (data: { name: string; hasStream?: boolean; order?: number; maxScore?: number }) => {
  const res = await api.post('/class-levels', data)
  return res.data
}

export const deleteClass = async (id: string) => {
  const res = await api.delete(`/class-levels/${id}`)
  return res.data
}
