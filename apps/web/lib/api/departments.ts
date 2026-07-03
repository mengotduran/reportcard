import api from './client'

export interface Department {
  id: string
  name: string
  order: number
  isDefault: boolean
}

export const getDepartmentsApi = async (): Promise<{ departments: Department[] }> => {
  const res = await api.get('/departments')
  return res.data
}

export const createDepartmentApi = async (name: string): Promise<{ department: Department }> => {
  const res = await api.post('/departments', { name })
  return res.data
}

export const updateDepartmentApi = async (id: string, data: { name?: string; order?: number }): Promise<{ department: Department }> => {
  const res = await api.put(`/departments/${id}`, data)
  return res.data
}

export const deleteDepartmentApi = async (id: string) => {
  const res = await api.delete(`/departments/${id}`)
  return res.data
}
