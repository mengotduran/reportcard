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

export const resetUserPasswordApi = async (userId: string, newPassword: string) => {
  const res = await api.put(`/auth/users/${userId}/reset-password`, { newPassword })
  return res.data
}

export const getMeApi = async (): Promise<{
  id: string; name: string; email: string; role: string
  masterClassLevel: string | null; school: any
}> => {
  const res = await api.get('/auth/me')
  return res.data
}
