'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getOverviewApi, toggleSchoolActiveApi, toggleParentSchoolActiveApi,
  createStandaloneSchoolApi, createParentSchoolApi, addSectionToParentApi,
  deleteSchoolApi, updateSchoolApi, addSectionToSchoolApi, getSchoolAdminsApi,
  OverviewData, ParentSchool, SchoolSection,
} from '@/lib/api/superadmin'
import { resetUserPasswordApi } from '@/lib/api/auth'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import {
  School, Users, FileText, Plus, X, ChevronDown, ChevronRight,
  Eye, EyeOff, Layers, Trash2, Pencil, KeyRound, ExternalLink,
} from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  PRIMARY:    'bg-primary/10 text-primary',
  SECONDARY:  'bg-purple-100 text-purple-700',
  UNIVERSITY: 'bg-orange-100 text-orange-700',
}

const SCHOOL_TYPES = ['PRIMARY', 'SECONDARY', 'UNIVERSITY']

const emptySectionForm = { type: 'PRIMARY', language: 'EN', subdomain: '', schoolEmail: '', adminName: '', adminEmail: '', adminPassword: '' }
const emptyStandaloneForm = { schoolName: '', schoolType: 'PRIMARY', language: 'EN', schoolEmail: '', subdomain: '', adminName: '', adminEmail: '', adminPassword: '', phone: '', city: '' }
const emptyParentForm = { name: '', city: '', country: '' }

// ─── Section form row ───────────────────────────────────────────────────────
function SectionFormRow({ idx, data, onChange, onRemove, canRemove, usedTypes }: {
  idx: number; data: typeof emptySectionForm
  onChange: (idx: number, field: string, val: string) => void
  onRemove: (idx: number) => void; canRemove: boolean; usedTypes: string[]
}) {
  const [showPw, setShowPw] = useState(false)
  // All types selectable — a type may repeat as long as the language differs.
  // The backend rejects duplicate type+language combos.
  void usedTypes
  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-muted">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${TYPE_COLORS[data.type]}`}>{data.type} · {data.language === 'FR' ? 'FR' : 'EN'}</span>
        {canRemove && <button type="button" onClick={() => onRemove(idx)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Section Type</label>
          <select value={data.type} onChange={(e) => onChange(idx, 'type', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Language</label>
          <select value={data.language} onChange={(e) => onChange(idx, 'language', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="EN">English</option>
            <option value="FR">French</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Subdomain</label>
          <input value={data.subdomain} onChange={(e) => onChange(idx, 'subdomain', e.target.value)} placeholder="school-primary"
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Section Email</label>
          <input type="email" value={data.schoolEmail} onChange={(e) => onChange(idx, 'schoolEmail', e.target.value)} placeholder="primary@school.com"
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Admin Name</label>
          <input value={data.adminName} onChange={(e) => onChange(idx, 'adminName', e.target.value)} placeholder="John Doe"
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Admin Email</label>
          <input type="email" value={data.adminEmail} onChange={(e) => onChange(idx, 'adminEmail', e.target.value)} placeholder="admin@school.com"
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Admin Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={data.adminPassword} onChange={(e) => onChange(idx, 'adminPassword', e.target.value)} placeholder="••••••••"
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground pr-8 focus:outline-none focus:ring-2 focus:ring-ring" />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const router = useRouter()
  const { toast, showToast, hideToast } = useToast()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toggleTarget, setToggleTarget] = useState<{ id: string; name: string; isActive: boolean; kind: 'school' | 'parent' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; students: number; reportCards: number } | null>(null)
  const [editTarget, setEditTarget] = useState<SchoolSection | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', address: '', subdomain: '', type: '', language: 'EN' })
  const [showAddSectionInEdit, setShowAddSectionInEdit] = useState(false)
  const [editSectionForm, setEditSectionForm] = useState({ ...emptySectionForm })
  const [savingSection, setSavingSection] = useState(false)
  // siblings = other sections of the same parent (loaded when edit opens)
  const [siblings, setSiblings] = useState<SchoolSection[]>([])

  // Modals
  const [showStandalone, setShowStandalone] = useState(false)
  const [showMulti, setShowMulti] = useState(false)
  const [addSectionParent, setAddSectionParent] = useState<ParentSchool | null>(null)

  // Forms
  const [standaloneForm, setStandaloneForm] = useState(emptyStandaloneForm)
  const [parentForm, setParentForm] = useState(emptyParentForm)
  const [sections, setSections] = useState([{ ...emptySectionForm }])
  const [addSectionForm, setAddSectionForm] = useState({ ...emptySectionForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [adminsSchool, setAdminsSchool] = useState<SchoolSection | null>(null)
  const [admins, setAdmins] = useState<{ id: string; name: string; email: string; role: string }[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [resetAdminTarget, setResetAdminTarget] = useState<{ id: string; name: string } | null>(null)
  const [resetAdminPw, setResetAdminPw] = useState('')
  const [resetAdminSaving, setResetAdminSaving] = useState(false)
  const [resetAdminError, setResetAdminError] = useState('')
  const [showResetAdminPw, setShowResetAdminPw] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const d = await getOverviewApi()
      setData(d)
    } catch {
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    try {
      if (toggleTarget.kind === 'school') await toggleSchoolActiveApi(toggleTarget.id)
      else await toggleParentSchoolActiveApi(toggleTarget.id)
      showToast(`${toggleTarget.name} ${toggleTarget.isActive ? 'deactivated' : 'activated'}`)
      setToggleTarget(null)
      fetchData()
    } catch {
      showToast('Failed to update status', 'error')
    }
  }

  // Section form helpers
  const updateSection = (idx: number, field: string, val: string) =>
    setSections((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  const removeSection = (idx: number) => setSections((prev) => prev.filter((_, i) => i !== idx))
  const addSection = () => {
    const usedTypes = sections.map((s) => s.type)
    const next = SCHOOL_TYPES.find((t) => !usedTypes.includes(t))
    if (next) setSections((prev) => [...prev, { ...emptySectionForm, type: next }])
  }

  const openAdminsModal = async (school: SchoolSection) => {
    setAdminsSchool(school)
    setAdminsLoading(true)
    setResetAdminTarget(null)
    setResetAdminPw('')
    setResetAdminError('')
    try {
      const { admins: list } = await getSchoolAdminsApi(school.id)
      setAdmins(list)
    } catch {
      setAdmins([])
    } finally {
      setAdminsLoading(false)
    }
  }

  const handleResetAdminPassword = async () => {
    if (!resetAdminTarget || resetAdminPw.length < 6) { setResetAdminError('Password must be at least 6 characters'); return }
    setResetAdminSaving(true)
    setResetAdminError('')
    try {
      await resetUserPasswordApi(resetAdminTarget.id, resetAdminPw)
      showToast(`Password updated for ${resetAdminTarget.name}`)
      setResetAdminTarget(null)
      setResetAdminPw('')
    } catch (e: any) {
      setResetAdminError(e.response?.data?.message || 'Failed to reset password')
    } finally {
      setResetAdminSaving(false)
    }
  }

  const openEdit = (school: SchoolSection) => {
    setEditTarget(school)
    setEditForm({ name: school.name, email: school.email, phone: school.phone ?? '', address: '', subdomain: school.subdomain, type: school.type, language: school.language === 'FR' ? 'FR' : 'EN' })
    setShowAddSectionInEdit(false)
    setFormError('')
    // Find siblings from current data
    const parent = data?.parentSchools.find((p) => p.sections.some((s) => s.id === school.id))
    setSiblings(parent ? parent.sections.filter((s) => s.id !== school.id) : [])
  }

  const handleAddSectionInEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSavingSection(true)
    try {
      await addSectionToSchoolApi(editTarget!.id, editSectionForm)
      showToast('Section added successfully')
      setShowAddSectionInEdit(false)
      setEditSectionForm({ ...emptySectionForm })
      fetchData()
      // Refresh siblings
      const d = await getOverviewApi()
      setData(d)
      const allSections = [...d.standaloneSchools, ...d.parentSchools.flatMap((p) => p.sections)]
      const updatedSchool = allSections.find((s) => s.id === editTarget!.id)
      if (updatedSchool) {
        const parent = d.parentSchools.find((p) => p.sections.some((s) => s.id === updatedSchool.id))
        setSiblings(parent ? parent.sections.filter((s) => s.id !== updatedSchool.id) : [])
      }
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to add section')
    } finally { setSavingSection(false) }
  }

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      await updateSchoolApi(editTarget!.id, editForm)
      showToast('School updated successfully')
      setEditTarget(null)
      fetchData()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to update school')
    } finally { setSaving(false) }
  }

  const handleDeleteSchool = async () => {
    if (!deleteTarget) return
    try {
      await deleteSchoolApi(deleteTarget.id)
      showToast('Section deleted successfully')
      setDeleteTarget(null)
      fetchData()
    } catch {
      showToast('Failed to delete section', 'error')
    }
  }

  const handleCreateStandalone = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      await createStandaloneSchoolApi(standaloneForm)
      showToast('School created successfully')
      setShowStandalone(false); setStandaloneForm(emptyStandaloneForm); fetchData()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to create school')
    } finally { setSaving(false) }
  }

  const handleCreateMulti = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      await createParentSchoolApi({ ...parentForm, sections })
      showToast('School and sections created successfully')
      setShowMulti(false); setParentForm(emptyParentForm); setSections([{ ...emptySectionForm }]); fetchData()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to create school')
    } finally { setSaving(false) }
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      await addSectionToParentApi(addSectionParent!.id, addSectionForm)
      showToast('Section added successfully')
      setAddSectionParent(null); setAddSectionForm({ ...emptySectionForm }); fetchData()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to add section')
    } finally { setSaving(false) }
  }

  // Summary numbers
  const totalSections = (data?.parentSchools ?? []).reduce((s, p) => s + p.sections.length, 0)
  const totalStandalone = data?.standaloneSchools.length ?? 0
  const totalStudents = [
    ...(data?.standaloneSchools ?? []),
    ...(data?.parentSchools ?? []).flatMap((p) => p.sections),
  ].reduce((s, sc) => s + sc._count.students, 0)
  const totalReportCards = [
    ...(data?.standaloneSchools ?? []),
    ...(data?.parentSchools ?? []).flatMap((p) => p.sections),
  ].reduce((s, sc) => s + sc._count.reportCards, 0)

  const summaryCards = [
    { label: 'Multi-Section Schools', value: data?.parentSchools.length ?? 0, icon: Layers, color: 'bg-primary/10 text-primary' },
    { label: 'Standalone Schools', value: totalStandalone, icon: School, color: 'bg-green-50 text-green-600' },
    { label: 'Total Students', value: totalStudents, icon: Users, color: 'bg-purple-50 text-purple-600' },
    { label: 'Total Report Cards', value: totalReportCards, icon: FileText, color: 'bg-orange-50 text-orange-600' },
  ]

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Schools</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage all schools and their sections on the platform</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowStandalone(true); setFormError('') }}
            className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition">
            <Plus size={15} /> Standalone School
          </button>
          <button onClick={() => { setShowMulti(true); setFormError('') }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
            <Layers size={15} /> Multi-Section School
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-10 h-10 rounded-lg ${c.color} flex items-center justify-center mb-3`}>
              <c.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-foreground">{c.value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Multi-section schools */}
      {(data?.parentSchools ?? []).length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Multi-Section Schools</h3>
          <div className="space-y-3">
            {data!.parentSchools.map((parent) => (
              <div key={parent.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Parent header */}
                <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted transition"
                  onClick={() => setExpanded((prev) => ({ ...prev, [parent.id]: !prev[parent.id] }))}>
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {parent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{parent.name}</p>
                    <p className="text-xs text-muted-foreground">{[parent.city, parent.country].filter(Boolean).join(', ')} · {parent.sections.length} section{parent.sections.length !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${parent.isActive ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                    {parent.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); setToggleTarget({ id: parent.id, name: parent.name, isActive: parent.isActive, kind: 'parent' }) }}
                    className={`text-xs px-3 py-1.5 rounded-lg transition ${parent.isActive ? 'text-destructive bg-destructive/10 hover:bg-destructive/10' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}>
                    {parent.isActive ? 'Deactivate All' : 'Activate All'}
                  </button>
                  {expanded[parent.id] ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                </div>

                {/* Sections */}
                {expanded[parent.id] && (
                  <div className="border-t border-gray-100">
                    {parent.sections.map((section, i) => (
                      <div key={section.id} className={`flex items-center gap-3 px-4 py-3 ${i < parent.sections.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-muted`}>
                        <div className="w-6 ml-3 text-muted-foreground text-xs font-mono flex-shrink-0">└</div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${TYPE_COLORS[section.type] ?? 'bg-muted text-muted-foreground'}`}>
                          {section.type} · {section.language === 'FR' ? 'FR' : 'EN'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium">{section.email}</p>
                          <p className="text-xs text-muted-foreground">{section.subdomain} · {section._count.students} students · {section._count.reportCards} cards</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${section.isActive ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                          {section.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button onClick={() => setToggleTarget({ id: section.id, name: section.type, isActive: section.isActive, kind: 'school' })}
                          className={`text-xs px-3 py-1.5 rounded-lg transition flex-shrink-0 ${section.isActive ? 'text-destructive bg-destructive/10 hover:bg-destructive/10' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}>
                          {section.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => openAdminsModal(section)}
                          className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition flex-shrink-0"
                          title="Manage Admins / Reset Password">
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(section)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition flex-shrink-0"
                          title="Edit section"
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => router.push(`/superadmin/schools/${section.id}`)}
                          className="p-1.5 text-muted-foreground hover:text-purple-600 hover:bg-purple-50 rounded-lg transition flex-shrink-0"
                          title="View details">
                          <ExternalLink size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: section.id, name: `${parent.name} — ${section.type}`, students: section._count.students, reportCards: section._count.reportCards })}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition flex-shrink-0"
                          title="Delete section"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {/* Add section — always visible if < 3 sections */}
                    {parent.sections.length < 3 && (
                      <div className="px-4 py-3 border-t border-dashed border-border bg-muted/50">
                        <button onClick={() => { setAddSectionParent(parent); setAddSectionForm({ ...emptySectionForm }); setFormError('') }}
                          className="flex items-center gap-2 text-sm text-primary hover:text-primary font-medium">
                          <Plus size={14} /> Add{' '}
                          {SCHOOL_TYPES.filter((t) => !parent.sections.map((s) => s.type).includes(t)).join(' or ')}{' '}
                          Section
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone schools */}
      {(data?.standaloneSchools ?? []).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Standalone Schools</h3>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {['School', 'Type', 'Subdomain', 'Students', 'Cards', 'Registered', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data!.standaloneSchools.map((school) => (
                  <tr key={school.id} className="hover:bg-muted dark:hover:bg-muted">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex-shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">{school.name.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{school.name}</p>
                          <p className="text-xs text-muted-foreground">{school.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${TYPE_COLORS[school.type] ?? 'bg-muted text-muted-foreground'}`}>{school.type} · {school.language === 'FR' ? 'FR' : 'EN'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{school.subdomain}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{school._count.students}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{school._count.reportCards}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(school.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${school.isActive ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                        {school.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setToggleTarget({ id: school.id, name: school.name, isActive: school.isActive, kind: 'school' })}
                          className={`text-xs px-3 py-1.5 rounded-lg transition ${school.isActive ? 'text-destructive bg-destructive/10 hover:bg-destructive/10' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}>
                          {school.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => openAdminsModal(school)}
                          className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition" title="Manage Admins / Reset Password">
                          <KeyRound size={14} />
                        </button>
                        <button onClick={() => openEdit(school)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => router.push(`/superadmin/schools/${school.id}`)}
                          className="p-1.5 text-muted-foreground hover:text-purple-600 hover:bg-purple-50 rounded-lg transition flex-shrink-0"
                          title="View details">
                          <ExternalLink size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget({ id: school.id, name: school.name, students: school._count.students, reportCards: school._count.reportCards })}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {(data?.parentSchools.length === 0 && data?.standaloneSchools.length === 0) && (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <School size={40} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No schools yet. Create the first one above.</p>
        </div>
      )}

      {/* ── Standalone school modal ── */}
      {showStandalone && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="font-semibold text-foreground text-lg">Create Standalone School</h3>
                <p className="text-xs text-muted-foreground mt-0.5">A single-section school with its own admin</p></div>
              <button onClick={() => setShowStandalone(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleCreateStandalone} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'School Name', key: 'schoolName', placeholder: 'Springfield Primary' },
                  { label: 'City', key: 'city', placeholder: 'Yaounde' },
                  { label: 'School Email', key: 'schoolEmail', placeholder: 'info@school.com', type: 'email' },
                  { label: 'Phone', key: 'phone', placeholder: '+237...' },
                  { label: 'Subdomain', key: 'subdomain', placeholder: 'springfield' },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{label}</label>
                    <input type={type || 'text'} placeholder={placeholder} value={(standaloneForm as any)[key]}
                      onChange={(e) => setStandaloneForm({ ...standaloneForm, [key]: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Type</label>
                  <select value={standaloneForm.schoolType} onChange={(e) => setStandaloneForm({ ...standaloneForm, schoolType: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Language</label>
                  <select value={standaloneForm.language} onChange={(e) => setStandaloneForm({ ...standaloneForm, language: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="EN">English</option>
                    <option value="FR">French</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Admin Account</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Admin Name', key: 'adminName', placeholder: 'John Doe' },
                    { label: 'Admin Email', key: 'adminEmail', placeholder: 'admin@school.com', type: 'email' },
                  ].map(({ label, key, placeholder, type }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{label}</label>
                      <input type={type || 'text'} placeholder={placeholder} value={(standaloneForm as any)[key]}
                        onChange={(e) => setStandaloneForm({ ...standaloneForm, [key]: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Password</label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={standaloneForm.adminPassword}
                        onChange={(e) => setStandaloneForm({ ...standaloneForm, adminPassword: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground pr-9 focus:outline-none focus:ring-2 focus:ring-ring" />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowStandalone(false)} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Multi-section school modal ── */}
      {showMulti && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="font-semibold text-foreground text-lg">Create Multi-Section School</h3>
                <p className="text-xs text-muted-foreground mt-0.5">One institution with separate PRIMARY / SECONDARY / UNIVERSITY sections</p></div>
              <button onClick={() => setShowMulti(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleCreateMulti} className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Institution Details</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Institution Name', key: 'name', placeholder: 'Greenfield Academy', span: 3 },
                    { label: 'City', key: 'city', placeholder: 'Yaounde' },
                    { label: 'Country', key: 'country', placeholder: 'Cameroon' },
                  ].map(({ label, key, placeholder, span }) => (
                    <div key={key} className={span === 3 ? 'col-span-3' : ''}>
                      <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{label}</label>
                      <input placeholder={placeholder} value={(parentForm as any)[key]}
                        onChange={(e) => setParentForm({ ...parentForm, [key]: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Sections</p>
                  {sections.length < 3 && (
                    <button type="button" onClick={addSection} className="flex items-center gap-1 text-xs text-primary hover:text-primary font-medium">
                      <Plus size={12} /> Add Section
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {sections.map((s, i) => (
                    <SectionFormRow key={i} idx={i} data={s}
                      onChange={updateSection} onRemove={removeSection}
                      canRemove={sections.length > 1}
                      usedTypes={sections.filter((_, j) => j !== i).map((x) => x.type)} />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowMulti(false)} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50">
                  {saving ? 'Creating...' : `Create School + ${sections.length} Section${sections.length > 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add section to existing parent modal ── */}
      {addSectionParent && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="font-semibold text-foreground text-lg">Add Section</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{addSectionParent.name}</p></div>
              <button onClick={() => setAddSectionParent(null)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleAddSection}>
              <SectionFormRow idx={0} data={addSectionForm}
                onChange={(_, field, val) => setAddSectionForm({ ...addSectionForm, [field]: val })}
                onRemove={() => {}} canRemove={false}
                usedTypes={addSectionParent.sections.map((s) => s.type)} />
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setAddSectionParent(null)} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit school modal ── */}
      {editTarget && (
        <div key={editTarget.id} className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-foreground text-lg">Edit School</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{editTarget.name}</p>
              </div>
              <button onClick={() => setEditTarget(null)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 pb-6">
            {formError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>}
            {/* School details form */}
            <form onSubmit={handleEditSave} className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">School Details</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'School Name', key: 'name', placeholder: 'Greenfield Academy' },
                  { label: 'Email', key: 'email', placeholder: 'info@school.com', type: 'email' },
                  { label: 'Phone', key: 'phone', placeholder: '+237...' },
                  { label: 'City', key: 'address', placeholder: 'Yaounde' },
                  { label: 'Subdomain', key: 'subdomain', placeholder: 'greenfield' },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{label}</label>
                    <input type={type || 'text'} placeholder={placeholder} value={(editForm as any)[key]}
                      onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Type</label>
                  <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Language (AI remarks)</label>
                  <select value={editForm.language} onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="EN">English</option>
                    <option value="FR">French</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>

            {/* Sections panel */}
            {([editTarget!, ...siblings].length < 3) || siblings.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Sections</p>

                {/* Current + siblings */}
                <div className="space-y-2 mb-3">
                  {[editTarget!, ...siblings].map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 bg-muted rounded-lg border border-border">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${TYPE_COLORS[s.type] ?? 'bg-muted text-muted-foreground'}`}>{s.type} · {s.language === 'FR' ? 'FR' : 'EN'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{s.email}</p>
                        <p className="text-xs text-muted-foreground">{s.subdomain}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Add section button / form */}
                {[editTarget!, ...siblings].length < 3 && (
                  <>
                    {!showAddSectionInEdit ? (
                      <button onClick={() => {
                        const usedTypes = [editTarget!.type, ...siblings.map((s) => s.type)]
                        const nextType = SCHOOL_TYPES.find((t) => !usedTypes.includes(t)) ?? 'PRIMARY'
                        setEditSectionForm({ ...emptySectionForm, type: nextType })
                        setShowAddSectionInEdit(true)
                        setFormError('')
                      }}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-primary/30 text-primary py-2.5 rounded-lg text-sm hover:bg-primary/10 transition">
                        <Plus size={14} /> Add{' '}
                        {SCHOOL_TYPES.filter((t) => ![editTarget!.type, ...siblings.map((s) => s.type)].includes(t)).join(' or ')}{' '}
                        Section
                      </button>
                    ) : (
                      <form onSubmit={handleAddSectionInEdit} className="space-y-3 border border-primary/20 rounded-xl p-3 bg-primary/10/40">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-primary">New Section</p>
                          <button type="button" onClick={() => setShowAddSectionInEdit(false)}><X size={13} className="text-muted-foreground" /></button>
                        </div>
                        <SectionFormRow idx={0} data={editSectionForm}
                          onChange={(_, field, val) => setEditSectionForm({ ...editSectionForm, [field]: val })}
                          onRemove={() => {}} canRemove={false}
                          usedTypes={[editTarget!.type, ...siblings.map((s) => s.type)]} />
                        <button type="submit" disabled={savingSection}
                          className="w-full bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50">
                          {savingSection ? 'Adding...' : 'Add Section'}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            ) : null}
            </div>{/* end scrollable */}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Section"
        message={
          deleteTarget
            ? deleteTarget.students > 0 || deleteTarget.reportCards > 0
              ? `"${deleteTarget.name}" has ${deleteTarget.students} student(s) and ${deleteTarget.reportCards} report card(s). All data will be permanently deleted. This cannot be undone.`
              : `Permanently delete "${deleteTarget.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Permanently"
        confirmColor="red"
        onConfirm={handleDeleteSchool}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={!!toggleTarget}
        title={`${toggleTarget?.isActive ? 'Deactivate' : 'Activate'} ${toggleTarget?.kind === 'parent' ? 'School' : 'Section'}`}
        message={toggleTarget?.isActive
          ? `Deactivating "${toggleTarget?.name}" will prevent their admin from logging in.`
          : `Activating "${toggleTarget?.name}" will restore their access.`}
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        confirmColor={toggleTarget?.isActive ? 'red' : 'blue'}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      {/* Manage Admins / Reset Password Modal */}
      {adminsSchool && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">School Admins</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{adminsSchool.name}</p>
              </div>
              <button onClick={() => { setAdminsSchool(null); setResetAdminTarget(null) }}
                className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            {adminsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading admins…</p>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No admins found for this school.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {admins.map(admin => (
                  <div key={admin.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{admin.name}</p>
                      <p className="text-xs text-muted-foreground">{admin.email} · {admin.role.replace('_', ' ')}</p>
                    </div>
                    <button
                      onClick={() => { setResetAdminTarget(admin); setResetAdminPw(''); setResetAdminError(''); setShowResetAdminPw(false) }}
                      className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg transition"
                    >
                      <KeyRound size={12} /> Reset Password
                    </button>
                  </div>
                ))}
              </div>
            )}

            {resetAdminTarget && (
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-xs font-medium text-foreground mb-2">Set new password for <span className="text-primary">{resetAdminTarget.name}</span></p>
                {resetAdminError && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 mb-2">{resetAdminError}</p>}
                <div className="relative mb-3">
                  <input
                    type={showResetAdminPw ? 'text' : 'password'}
                    placeholder="New password (min 6 characters)"
                    value={resetAdminPw}
                    onChange={e => setResetAdminPw(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="button" onClick={() => setShowResetAdminPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showResetAdminPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setResetAdminTarget(null)}
                    className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                    Cancel
                  </button>
                  <button onClick={handleResetAdminPassword} disabled={resetAdminSaving}
                    className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                    {resetAdminSaving ? 'Saving…' : 'Set Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
