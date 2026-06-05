import api from './client'

export const loginApi = async (data: { email: string; password: string }) => {
  const res = await api.post('/auth/login', data)
  return res.data as { token: string; user: { id: string; name: string; email: string; role: string; schoolId: string | null; masterClassLevel?: string | null }; school: { id: string; name: string; type: string; logo: string | null; coverImage: string | null; coverImages: string[] } | null }
}

export const resetUserPasswordApi = async (userId: string, newPassword: string) => {
  const res = await api.put(`/auth/users/${userId}/reset-password`, { newPassword })
  return res.data
}

export const getMeApi = async () => {
  const res = await api.get('/auth/me')
  return res.data as { id: string; name: string; email: string; role: string; school: { id: string; name: string; type: string; logo: string | null; coverImage: string | null; coverImages: string[] } | null }
}
