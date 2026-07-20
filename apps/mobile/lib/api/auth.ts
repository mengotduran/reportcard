import api from './client'

export const loginApi = async (data: { email: string; password: string }) => {
  const res = await api.post('/auth/login', data)
  return res.data as { token: string; user: { id: string; name: string; email: string; role: string; schoolId: string | null; masterClassLevel?: string | null }; school: { id: string; name: string; type: string; logo: string | null; coverImage: string | null; coverImages: string[] } | null }
}

// The mobile app is cloud-only — the API always emails the target user a
// setup link rather than taking a password here.
export const resetUserPasswordApi = async (userId: string) => {
  const res = await api.put(`/auth/users/${userId}/reset-password`, {})
  return res.data
}

export const getMeApi = async () => {
  const res = await api.get('/auth/me')
  return res.data as { id: string; name: string; email: string; role: string; school: { id: string; name: string; type: string; logo: string | null; coverImage: string | null; coverImages: string[] } | null }
}

export const forgotPasswordApi = async (email: string) => {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data as { message: string }
}

export const changeMyPasswordApi = async (currentPassword: string, newPassword: string) => {
  const res = await api.put('/auth/me/password', { currentPassword, newPassword })
  return res.data as { message: string }
}
