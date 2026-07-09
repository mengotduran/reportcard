import api from './client'

export interface Department {
  id: string
  name: string
  order: number
  isDefault: boolean
}

export const getDepartments = async (): Promise<{ departments: Department[] }> => {
  const res = await api.get('/departments')
  return res.data
}

export const createDepartment = async (name: string): Promise<{ department: Department }> => {
  const res = await api.post('/departments', { name })
  return res.data
}

export const deleteDepartment = async (id: string) => {
  const res = await api.delete(`/departments/${id}`)
  return res.data
}
