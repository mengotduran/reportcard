import api from './client'

export const loginApi = async (email: string, password: string) => {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export const registerSchoolApi = async (data: {
  schoolName: string
  schoolType: string
  schoolEmail: string
  schoolPhone: string
  schoolAddress: string
  subdomain: string
  adminName: string
  adminEmail: string
  adminPassword: string
}) => {
  const res = await api.post('/auth/register', data)
  return res.data
}

export const resetSuperAdminApi = async (secretKey: string, newPassword: string) => {
  const res = await api.post('/auth/reset-superadmin', { secretKey, newPassword })
  return res.data
}

export const forgotPasswordApi = async (email: string) => {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data as { message: string }
}

export const resetPasswordApi = async (token: string, newPassword: string) => {
  const res = await api.post('/auth/reset-password', { token, newPassword })
  return res.data as { message: string }
}

export const changeMyPasswordApi = async (currentPassword: string, newPassword: string) => {
  const res = await api.put('/auth/me/password', { currentPassword, newPassword })
  return res.data as { message: string }
}

export const resetUserPasswordApi = async (userId: string, newPassword: string) => {
  const res = await api.put(`/auth/users/${userId}/reset-password`, { newPassword })
  return res.data
}

export const getMeApi = async (): Promise<{
  id: string; name: string; email: string; role: string
  masterClassLevel: string | null; preferredLanguage: string; school: any
}> => {
  const res = await api.get('/auth/me')
  return res.data
}

export const updateLanguagePreferenceApi = async (language: 'EN' | 'FR') => {
  const res = await api.patch('/auth/me/language', { language })
  return res.data as { preferredLanguage: string }
}

export const updateMyEmailApi = async (email: string) => {
  const res = await api.patch('/auth/me/email', { email })
  return res.data as { id: string; name: string; email: string; role: string }
}
