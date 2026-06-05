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

export const getOverview = async (): Promise<OverviewData> => {
  const res = await api.get('/superadmin/overview')
  return res.data
}

export const toggleSchool = async (id: string) => {
  const res = await api.patch(`/superadmin/schools/${id}/toggle`)
  return res.data
}

export const toggleParentSchool = async (id: string) => {
  const res = await api.patch(`/superadmin/parent-schools/${id}/toggle`)
  return res.data
}

export const getSchoolAdmins = async (schoolId: string): Promise<{
  admins: { id: string; name: string; email: string; role: string }[]
}> => {
  const res = await api.get(`/superadmin/schools/${schoolId}/admins`)
  return res.data
}

export const createStandaloneSchool = async (data: {
  schoolName: string
  schoolType: string
  schoolEmail: string
  subdomain: string
  adminName: string
  adminEmail: string
  adminPassword: string
  phone?: string
}) => {
  const res = await api.post('/superadmin/schools', data)
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
