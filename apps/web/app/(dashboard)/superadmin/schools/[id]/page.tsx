'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSchoolDetailApi, SchoolDetail } from '@/lib/api/superadmin'
import {
  ArrowLeft, Users, BookOpen, FileText, CheckCircle, Clock,
  School, Building2, Layers, MapPin, Mail, Phone, Globe
} from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  PRIMARY:    'bg-primary/10 text-primary',
  SECONDARY:  'bg-purple-100 text-purple-700',
  UNIVERSITY: 'bg-orange-100 text-orange-700',
}

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: 'School Admin',
  VICE_PRINCIPAL: 'Vice Principal',
  CLASS_MASTER: 'Class Master',
  CLASS_TEACHER: 'Class Teacher',
  SUBJECT_TEACHER: 'Subject Teacher',
}

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [detail, setDetail] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getSchoolDetailApi(id)
      .then(setDetail)
      .catch(() => setError('Failed to load school details.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
  if (error || !detail) return (
    <div className="text-center py-12">
      <p className="text-destructive text-sm">{error || 'School not found.'}</p>
    </div>
  )

  const { school, classes, staff, subjects, reportCards } = detail
  const published = reportCards.find(r => r.status === 'PUBLISHED')?.count ?? 0
  const draft = reportCards.find(r => r.status === 'DRAFT')?.count ?? 0
  const teacherRoles = ['CLASS_MASTER', 'CLASS_TEACHER', 'SUBJECT_TEACHER']
  const teachers = staff.filter(s => teacherRoles.includes(s.role)).reduce((a, b) => a + b.count, 0)

  const stats = [
    { label: 'Total Students', value: school.totalStudents, icon: Users, color: 'bg-purple-50 text-purple-600' },
    { label: 'Teachers', value: teachers, icon: School, color: 'bg-green-50 text-green-600' },
    { label: 'Subjects', value: subjects, icon: BookOpen, color: 'bg-orange-50 text-orange-600' },
    { label: 'Report Cards', value: school.totalReportCards, icon: FileText, color: 'bg-primary/10 text-primary' },
  ]

  return (
    <div>
      {/* Back + header */}
      <div className="mb-6">
        <button onClick={() => router.push('/superadmin')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
          <ArrowLeft size={16} /> Back to Schools
        </button>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {school.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${TYPE_COLORS[school.type] ?? 'bg-muted text-muted-foreground'}`}>
                {school.type}
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${school.isActive ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                {school.isActive ? 'Active' : 'Inactive'}
              </span>
              {school.parentSchool && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                  <Layers size={11} /> {school.parentSchool.name}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-foreground">{school.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{school.subdomain}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(st => (
          <div key={st.label} className="bg-card border border-border rounded-xl p-5">
            <div className={`w-10 h-10 rounded-lg ${st.color} flex items-center justify-center mb-3`}>
              <st.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-foreground">{st.value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{st.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classes */}
        <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Classes ({classes.length})</h3>
          </div>
          {classes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No classes yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {classes.map(cls => (
                <div key={cls.classLevel} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-green-50 text-green-700 rounded-lg flex items-center justify-center text-xs font-bold">
                      {cls.classLevel.charAt(0)}
                    </div>
                    <span className="text-sm text-foreground font-medium">{cls.classLevel}</span>
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">{cls.students} student{cls.students !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Staff + Report Cards + Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Staff */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Staff ({school.totalUsers})</h3>
            </div>
            {staff.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No staff yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {staff.map(st => (
                  <div key={st.role} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-foreground">{ROLE_LABELS[st.role] ?? st.role}</span>
                    <span className="text-sm font-bold text-foreground">{st.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report cards */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Report Cards ({school.totalReportCards})</h3>
            </div>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm text-foreground">Published</span>
                </div>
                <span className="text-sm font-bold text-green-600">{published}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-amber-600" />
                  <span className="text-sm text-foreground">Draft</span>
                </div>
                <span className="text-sm font-bold text-amber-600">{draft}</span>
              </div>
            </div>
          </div>

          {/* School info */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">School Info</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                { icon: Mail, label: 'Email', value: school.email },
                { icon: Phone, label: 'Phone', value: school.phone ?? '—' },
                { icon: MapPin, label: 'Address', value: school.address ?? '—' },
                { icon: Globe, label: 'Subdomain', value: school.subdomain },
                { icon: Building2, label: 'Registered', value: new Date(school.createdAt).toLocaleDateString() },
              ].map(info => (
                <div key={info.label} className="flex items-center gap-3 px-5 py-3">
                  <info.icon size={14} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground w-20">{info.label}</span>
                  <span className="text-sm text-foreground font-medium truncate">{info.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
