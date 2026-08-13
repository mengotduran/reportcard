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

// Offline installs, or a target with no email on file, always pass newPassword directly.
// Online with an email: omitting newPassword emails a setup link (the default); passing
// { newPassword, mode: 'direct' } instead overrides that — for someone who still has an
// email on file but has lost access to that inbox, where re-sending a link is a dead end.
export const resetUserPasswordApi = async (userId: string, newPassword?: string, mode?: 'direct') => {
  const res = await api.put(`/auth/users/${userId}/reset-password`, newPassword ? { newPassword, ...(mode ? { mode } : {}) } : {})
  return res.data
}

export const getMeApi = async (): Promise<{
  id: string; name: string; email: string | null; username?: string | null; role: string
  masterClassLevel: string | null; preferredLanguage: string; school: any
}> => {
  const res = await api.get('/auth/me')
  return res.data
}

export const updateLanguagePreferenceApi = async (language: 'EN' | 'FR') => {
  const res = await api.patch('/auth/me/language', { language })
  return res.data as { preferredLanguage: string }
}

// Self-service — this is how a username-only account (no email on file) adds a real one
// afterward, unlocking email-based password recovery going forward. Their username keeps
// working as a login identifier too; it's never cleared.
// `currentPassword` is required only when CHANGING an address that is already on file —
// adding a first one stays frictionless. See updateMyEmail.
export const updateMyEmailApi = async (email: string, currentPassword?: string) => {
  const res = await api.patch('/auth/me/email', { email, ...(currentPassword ? { currentPassword } : {}) })
  return res.data as { id: string; name: string; email: string; role: string }
}
