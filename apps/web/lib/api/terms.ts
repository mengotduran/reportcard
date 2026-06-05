import api from './client'

export const getTermsApi = async () => {
  const res = await api.get('/terms')
  return res.data
}

export const createTermApi = async (data: {
  name: string
  session: string
  startDate: string
  endDate: string
}) => {
  const res = await api.post('/terms', data)
  return res.data
}

export const updateTermApi = async (id: string, data: { name?: string; session?: string; startDate?: string; endDate?: string }) => {
  const res = await api.put(`/terms/${id}`, data)
  return res.data
}

export const setCurrentTermApi = async (id: string) => {
  const res = await api.put(`/terms/${id}/set-current`)
  return res.data
}

export const deleteTermApi = async (id: string) => {
  const res = await api.delete(`/terms/${id}`)
  return res.data
}
