import api from './client'

export interface SectionCount { students: number; users: number; reportCards: number }

export interface SchoolSection {
  id: string
  name: string
  type: string
  email: string
  subdomain: string
  phone: string | null
  isActive: boolean
  createdAt: string
  _count: SectionCount
}

export interface ParentSchool {
  id: string
  name: string
  city: string | null
  country: string | null
  isActive: boolean
  createdAt: string
  sections: SchoolSection[]
}

export interface OverviewData {
  parentSchools: ParentSchool[]
  standaloneSchools: SchoolSection[]
}

export const getOverviewApi = async (): Promise<OverviewData> => {
  const res = await api.get('/superadmin/overview')
  return res.data
}

export const toggleSchoolActiveApi = async (id: string) => {
  const res = await api.patch(`/superadmin/schools/${id}/toggle`)
  return res.data
}

export const toggleParentSchoolActiveApi = async (id: string) => {
  const res = await api.patch(`/superadmin/parent-schools/${id}/toggle`)
  return res.data
}

export const createStandaloneSchoolApi = async (data: {
  schoolName: string; schoolType: string; schoolEmail: string; subdomain: string
  adminName: string; adminEmail: string; adminPassword: string; phone?: string; city?: string
}) => {
  const res = await api.post('/superadmin/schools', data)
  return res.data
}

export const createParentSchoolApi = async (data: {
  name: string; city?: string; country?: string
  sections: { type: string; subdomain: string; schoolEmail: string; adminName: string; adminEmail: string; adminPassword: string }[]
}) => {
  const res = await api.post('/superadmin/parent-schools', data)
  return res.data
}

export const addSectionToSchoolApi = async (id: string, data: {
  type: string; subdomain: string; schoolEmail: string; adminName: string; adminEmail: string; adminPassword: string
}) => {
  const res = await api.post(`/superadmin/schools/${id}/sections`, data)
  return res.data
}

export const updateSchoolApi = async (id: string, data: {
  name?: string; email?: string; phone?: string; address?: string; subdomain?: string; type?: string
}) => {
  const res = await api.put(`/superadmin/schools/${id}`, data)
  return res.data
}

export const deleteSchoolApi = async (id: string) => {
  const res = await api.delete(`/superadmin/schools/${id}`)
  return res.data
}

export const addSectionToParentApi = async (parentId: string, data: {
  type: string; subdomain: string; schoolEmail: string; adminName: string; adminEmail: string; adminPassword: string
}) => {
  const res = await api.post(`/superadmin/parent-schools/${parentId}/sections`, data)
  return res.data
}

export const getSchoolAdminsApi = async (schoolId: string): Promise<{
  admins: { id: string; name: string; email: string; role: string; isActive: boolean }[]
}> => {
  const res = await api.get(`/superadmin/schools/${schoolId}/admins`)
  return res.data
}

export interface SchoolDetail {
  school: {
    id: string; name: string; type: string; email: string; phone: string | null
    address: string | null; subdomain: string; isActive: boolean; createdAt: string
    parentSchool: { id: string; name: string } | null
    totalStudents: number; totalUsers: number; totalReportCards: number
  }
  classes: { classLevel: string; students: number }[]
  staff: { role: string; count: number }[]
  subjects: number
  reportCards: { status: string; count: number }[]
}

export const getSchoolDetailApi = async (schoolId: string): Promise<SchoolDetail> => {
  const res = await api.get(`/superadmin/schools/${schoolId}/detail`)
  return res.data
}
