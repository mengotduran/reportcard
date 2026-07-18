'use client'
import { useEffect, useState } from 'react'
import { getTeachersApi, createTeacherApi, updateTeacherApi, deleteTeacherApi, getTeacherSubjectsApi, assignTeacherSubjectsApi } from '@/lib/api/teachers'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getClassLevelsApi } from '@/lib/api/classLevels'
import { getDepartmentsApi, Department } from '@/lib/api/departments'

// Secondary non-default departments store classes with a " (Department)" suffix.
const stripSection = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()
// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}". Universities have no real Department table row — mirrors
// deptFromClassName in apps/web/app/(dashboard)/classes/page.tsx.
const univDeptFromClassName = (name: string): string => {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}
import { useAuthStore } from '@/lib/store/auth.store'
import { School, Plus, Trash2, X, Eye, EyeOff, BookOpen, Info, Pencil, KeyRound, ArrowLeft, Users } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/lib/useToast'
import { resetUserPasswordApi } from '@/lib/api/auth'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'

interface Teacher { id: string; name: string; email: string; role: string; masterClassLevel?: string | null; createdAt: string; classLevels?: string[]; departments?: string[] }
interface Subject { id: string; name: string; classLevel: string; term?: string | null }

const emptyForm = { name: '', email: '', password: '', role: 'CLASS_TEACHER', masterClassLevel: '', departments: [] as string[] }

const roleLabels: Record<string, string> = {
  CLASS_TEACHER: 'Class Teacher',
  CLASS_MASTER: 'Class Master',
  SUBJECT_TEACHER: 'Subject Teacher',
  VICE_PRINCIPAL: 'Vice Principal',
}
const roleColors: Record<string, string> = {
  CLASS_TEACHER: 'bg-primary/10 text-primary',
  CLASS_MASTER: 'bg-indigo-100 text-indigo-700',
  SUBJECT_TEACHER: 'bg-green-100 text-green-700',
  VICE_PRINCIPAL: 'bg-purple-100 text-purple-700',
}

export default function TeachersPage() {
  const { toast, showToast, hideToast } = useToast()
  const tr = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const [classToDept, setClassToDept] = useState<Record<string, string>>({})
  const [departments, setDepartments] = useState<Department[]>([])
  // null = show the department picker (secondary/university only). Primary schools
  // have no department concept, so they skip straight to the plain table.
  const [activeDept, setActiveDept] = useState<string | null>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  const [classLevels, setClassLevels] = useState<string[]>([])
  const [availableTerms, setAvailableTerms] = useState<string[]>([])
  const [selectedTerm, setSelectedTerm] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [editForm, setEditForm] = useState({ role: '', masterClassLevel: '', departments: [] as string[] })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [resetTarget, setResetTarget] = useState<Teacher | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [assignTarget, setAssignTarget] = useState<Teacher | null>(null)
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [reassignedInfo, setReassignedInfo] = useState<string[]>([])

  useEffect(() => { fetchAll() }, [])
  // Re-fetch teachers when the semester tab changes (but not on the initial
  // mount — fetchAll already loads teachers for the first term).
  const [termInitialised, setTermInitialised] = useState(false)
  useEffect(() => {
    if (!selectedTerm || !termInitialised) return
    getTeachersApi({ term: selectedTerm }).then((d) => setTeachers(d.teachers)).catch(() => {})
  }, [selectedTerm])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [sd, clData] = await Promise.all([getSubjectsApi(), getClassLevelsApi()])
      setAllSubjects(sd.subjects)
      setClassLevels(clData.classLevels.sort((a: any, b: any) => a.order - b.order).map((cl: any) => cl.name))
      // Secondary: map each class to its department so the assignment modal can
      // group subjects by department (a teacher may span several departments).
      if (isSecondary) {
        try {
          const { departments: depts } = await getDepartmentsApi()
          setDepartments(depts)
          const byId = new Map(depts.map((d) => [d.id, d.name]))
          setClassToDept(Object.fromEntries(clData.classLevels.map((cl: any) => [cl.name, byId.get(cl.departmentId) ?? 'Grammar'])))
        } catch { /* non-fatal */ }
      }
      // For university, derive available semesters from the subjects list and
      // load teachers for the first semester right away.
      if (isUniversity) {
        const terms = [...new Set((sd.subjects as Subject[]).map((s) => s.term).filter(Boolean))] as string[]
        setAvailableTerms(terms)
        const first = terms[0] ?? ''
        setSelectedTerm(first)
        const td = await getTeachersApi(first ? { term: first } : undefined)
        setTeachers(td.teachers)
        setTermInitialised(true)
      } else {
        const td = await getTeachersApi()
        setTeachers(td.teachers)
      }
    } catch {
      showToast(tr('Failed to load data'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.role === 'CLASS_MASTER' && !form.masterClassLevel) {
      setError(tr('Please select the class this person is master of'))
      return
    }
    setSaving(true)
    try {
      await createTeacherApi({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        masterClassLevel: form.role === 'CLASS_MASTER' ? form.masterClassLevel : undefined,
        departments: form.departments,
      })
      setShowModal(false)
      setForm(emptyForm)
      fetchAll()
      showToast(tr('Teacher added successfully'))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || tr('Failed to create teacher'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteTeacherApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchAll()
      showToast(tr('Teacher removed'))
    } catch {
      showToast(tr('Failed to remove teacher'), 'error')
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 6) { setResetError(tr('Password must be at least 6 characters')); return }
    setResetSaving(true)
    setResetError('')
    try {
      await resetUserPasswordApi(resetTarget.id, resetPassword)
      showToast(`${tr('Password updated for')} ${resetTarget.name}`)
      setResetTarget(null)
      setResetPassword('')
    } catch (e: any) {
      setResetError(e.response?.data?.message || tr('Failed to reset password'))
    } finally {
      setResetSaving(false)
    }
  }

  const openEditModal = (teacher: Teacher) => {
    setEditTarget(teacher)
    setEditForm({ role: teacher.role, masterClassLevel: teacher.masterClassLevel ?? '', departments: teacher.departments ?? [] })
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    if (editForm.role === 'CLASS_MASTER' && !editForm.masterClassLevel) {
      setEditError(tr('Please select the class they are master of'))
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const result = await updateTeacherApi(editTarget.id, {
        role: editForm.role,
        masterClassLevel: editForm.role === 'CLASS_MASTER' ? editForm.masterClassLevel : null,
        departments: editForm.departments,
      })
      setEditTarget(null)
      fetchAll()
      if (result.displaced) showToast(result.displaced)
      else showToast(tr('Teacher updated'))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setEditError(e.response?.data?.message || tr('Failed to update teacher'))
    } finally {
      setEditSaving(false)
    }
  }

  const openAssignModal = async (teacher: Teacher) => {
    setAssignTarget(teacher)
    setReassignedInfo([])
    try {
      const data = await getTeacherSubjectsApi(teacher.id)
      setAssignedIds(data.subjects.map((s: Subject) => s.id))
    } catch {
      setAssignedIds([])
    }
  }

  const toggleSubject = (id: string) => {
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleAssignSave = async () => {
    if (!assignTarget) return
    setAssigning(true)
    try {
      const result = await assignTeacherSubjectsApi(assignTarget.id, assignedIds)
      if (result.reassigned?.length) {
        setReassignedInfo(result.reassigned)
      } else {
        showToast(tr(isUniversity ? 'Courses assigned successfully' : 'Subjects assigned successfully'))
        setAssignTarget(null)
      }
    } catch {
      showToast(tr('Failed to assign subjects'), 'error')
    } finally {
      setAssigning(false)
    }
  }

  // For university: only show courses from the selected semester in the
  // subject-assignment modal — prevents assigning "First Semester" courses
  // to a "Second Semester" teacher by accident.
  // For secondary/university: the modal opens from inside a department (the table
  // itself is only reachable once one is picked), so it only offers that
  // department's classes/subjects — a Grammar teacher's assign modal has no reason
  // to show Commercial subjects.
  const modalSubjects = (() => {
    let subs = isUniversity && selectedTerm ? allSubjects.filter((s) => s.term === selectedTerm) : allSubjects
    if (activeDept) {
      subs = subs.filter((s) => isSecondary ? classToDept[s.classLevel] === activeDept : univDeptFromClassName(s.classLevel) === activeDept)
    }
    return subs
  })()
  const grouped = modalSubjects.reduce<Record<string, Subject[]>>((acc, s) => {
    if (!acc[s.classLevel]) acc[s.classLevel] = []
    acc[s.classLevel].push(s)
    return acc
  }, {})

  // Department picker (secondary/university only): a teacher's department(s) are the
  // union of what they're explicitly placed in (t.departments, set at creation/edit)
  // and what's derived from the classes they're attached to (classLevels, from
  // assigned subjects + masterClassLevel) — so they show up the moment they're
  // placed, and stay showing up if later assigned a subject there some other way. A
  // teacher spanning several departments naturally surfaces under each one.
  const hasDeptView = isSecondary || isUniversity
  const teacherDeptNames = (t: Teacher): string[] => {
    const cls = t.classLevels ?? []
    const derived = isSecondary
      ? cls.map((c) => classToDept[c]).filter((d): d is string => !!d)
      : isUniversity
        ? cls.map((c) => univDeptFromClassName(c))
        : []
    return [...new Set([...(t.departments ?? []), ...derived])]
  }
  const deptNames = isSecondary
    ? departments.map((d) => d.name)
    : isUniversity
      ? [...new Set(classLevels.map((c) => univDeptFromClassName(c)))].sort()
      : []
  const deptCards = deptNames.map((name) => ({ name, count: teachers.filter((t) => teacherDeptNames(t).includes(name)).length }))
  const scopedTeachers = hasDeptView && activeDept
    ? teachers.filter((t) => teacherDeptNames(t).includes(activeDept))
    : teachers

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(scopedTeachers, 15)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {hasDeptView && activeDept ? activeDept : tr('Teachers')}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {hasDeptView && activeDept
              ? `${scopedTeachers.length} ${tr('in this department')}`
              : `${teachers.length} ${tr('total staff members')}`}
          </p>
        </div>
        <button onClick={() => { setForm({ ...emptyForm, departments: activeDept ? [activeDept] : [] }); setShowModal(true) }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> {tr('Add Teacher')}
        </button>
      </div>

      {/* Department picker — secondary/university only. The table doesn't show until
          a department is picked, since the whole point is to browse teachers grouped
          by department rather than one long flat list. */}
      {hasDeptView && !activeDept ? (
        loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {deptCards.map((d) => (
              <button key={d.name} onClick={() => setActiveDept(d.name)}
                className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Users size={16} />
                </div>
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.count} {tr(d.count === 1 ? 'teacher' : 'teachers')}</p>
              </button>
            ))}
            {deptCards.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                {tr('No departments defined yet — go to the Classes page to add them.')}
              </div>
            )}
          </div>
        )
      ) : (
      <>
      {hasDeptView && activeDept && (
        <button onClick={() => setActiveDept(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
          <ArrowLeft size={14} /> {tr('Back to Departments')}
        </button>
      )}

      {/* Semester tabs — university only */}
      {isUniversity && availableTerms.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {availableTerms.map((term) => (
            <button key={term} onClick={() => setSelectedTerm(term)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                selectedTerm === term
                  ? 'bg-primary text-white border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'
              }`}>
              {term}
            </button>
          ))}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
        ) : scopedTeachers.length === 0 ? (
          <div className="text-center py-12">
            <School size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{tr('No teachers yet.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Name')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Email')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Role')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Master Of')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Joined')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((t) => (
                <tr key={t.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {t.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{t.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block whitespace-nowrap text-xs px-2 py-1 rounded-full font-medium ${roleColors[t.role] || 'bg-muted text-muted-foreground'}`}>
                      {tr(roleLabels[t.role] || t.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {t.masterClassLevel
                      ? <span className="inline-block whitespace-nowrap text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">{isSecondary ? stripSection(t.masterClassLevel) : t.masterClassLevel}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openAssignModal(t)}
                        className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/10 px-2 py-1.5 rounded transition">
                        <BookOpen size={12} /> {tr(isUniversity ? 'Courses' : 'Subjects')}
                      </button>
                      <button onClick={() => openEditModal(t)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition" title={tr('Edit')}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => { setResetTarget(t); setResetPassword(''); setResetError(''); setShowResetPw(false) }}
                        className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 rounded transition" title={tr('Reset Password')}>
                        <KeyRound size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>
      </>
      )}

      {/* Add Teacher Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{tr('Add Teacher')}</h3>
              <button onClick={() => { setShowModal(false); setError('') }} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Full Name')} <span className="text-destructive">*</span></label>
                <input type="text" placeholder="Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Email')} <span className="text-destructive">*</span></label>
                <input type="email" placeholder="jane@school.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Password')} <span className="text-destructive">*</span></label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Role')}</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, masterClassLevel: '' })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="CLASS_TEACHER">{tr('Class Teacher')}</option>
                  <option value="CLASS_MASTER">{tr('Class Master')}</option>
                </select>
              </div>
              {hasDeptView && deptNames.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1.5">{tr('Departments')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {deptNames.map((d) => {
                      const on = form.departments.includes(d)
                      return (
                        <button key={d} type="button"
                          onClick={() => setForm({ ...form, departments: on ? form.departments.filter((x) => x !== d) : [...form.departments, d] })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{tr('A teacher can belong to more than one department.')}</p>
                </div>
              )}
              {form.role === 'CLASS_MASTER' && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Class they are Master of')} <span className="text-destructive">*</span></label>
                  <select value={form.masterClassLevel} onChange={(e) => setForm({ ...form, masterClassLevel: e.target.value })} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                    <option value="">{tr('Select a class')}</option>
                    {classLevels.map(cl => (
                      <option key={cl} value={cl}>{isSecondary ? (classToDept[cl] ? `${stripSection(cl)} · ${classToDept[cl]}` : stripSection(cl)) : cl}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">{tr('This is the class they write general remarks for.')}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">{tr('Cancel')}</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? tr('Adding...') : tr('Add Teacher')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Subjects Modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{isUniversity ? `${tr('Assign Courses')}${selectedTerm ? ` — ${selectedTerm}` : ''}` : tr('Assign Subjects')}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{assignTarget.name} · {tr(roleLabels[assignTarget.role])}</p>
              </div>
              <button onClick={() => setAssignTarget(null)} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>

            {/* Reassignment notice */}
            {reassignedInfo.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">{tr(isUniversity ? 'Courses reassigned:' : 'Subjects reassigned:')}</p>
                    {reassignedInfo.map((msg, i) => (
                      <p key={i} className="text-xs text-amber-700">{msg}</p>
                    ))}
                    <button onClick={() => { setReassignedInfo([]); setAssignTarget(null); showToast(tr(isUniversity ? 'Courses assigned successfully' : 'Subjects assigned successfully')) }}
                      className="mt-2 text-xs text-amber-800 font-semibold underline">
                      {tr('OK, got it')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Already scoped to the active department (modalSubjects above), so
                  every group here is the same department — no badge needed. */}
              {Object.entries(grouped)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([classLevel, subjects]) => (
                <div key={classLevel}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                    {isSecondary ? stripSection(classLevel) : classLevel}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {subjects.map((s) => (
                      <button key={s.id} onClick={() => toggleSubject(s.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition ${
                          assignedIds.includes(s.id)
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-muted border-border text-foreground hover:bg-muted'
                        }`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${assignedIds.includes(s.id) ? 'bg-primary' : 'border border-border bg-background'}`}>
                          {assignedIds.includes(s.id) && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {allSubjects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{tr(isUniversity ? 'No courses found. Add courses first.' : 'No subjects found. Add subjects first.')}</p>}
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
              <button onClick={() => setAssignTarget(null)}
                className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">{tr('Cancel')}</button>
              <button onClick={handleAssignSave} disabled={assigning || reassignedInfo.length > 0}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {assigning ? tr('Saving...') : `${tr('Save (')}${assignedIds.length} ${tr(isUniversity ? 'courses' : 'subjects')})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{tr('Edit Teacher')}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{editTarget.name}</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>
            {editError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{editError}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Role')}</label>
                <select value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value, masterClassLevel: '' })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="CLASS_TEACHER">{tr('Class Teacher')}</option>
                  <option value="CLASS_MASTER">{tr('Class Master')}</option>
                </select>
              </div>
              {hasDeptView && deptNames.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1.5">{tr('Departments')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {deptNames.map((d) => {
                      const on = editForm.departments.includes(d)
                      return (
                        <button key={d} type="button"
                          onClick={() => setEditForm({ ...editForm, departments: on ? editForm.departments.filter((x) => x !== d) : [...editForm.departments, d] })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{tr('A teacher can belong to more than one department.')}</p>
                </div>
              )}
              {editForm.role === 'CLASS_MASTER' && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Class they are Master of')} <span className="text-destructive">*</span></label>
                  <select value={editForm.masterClassLevel}
                    onChange={(e) => setEditForm({ ...editForm, masterClassLevel: e.target.value })} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                    <option value="">{tr('Select a class')}</option>
                    {classLevels.map(cl => (
                      <option key={cl} value={cl}>{isSecondary ? (classToDept[cl] ? `${stripSection(cl)} · ${classToDept[cl]}` : stripSection(cl)) : cl}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">{tr('If another person is already master of this class, they will become a Class Teacher.')}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">{tr('Cancel')}</button>
                <button onClick={handleEditSave} disabled={editSaving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {editSaving ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">{tr('Reset Password')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{resetTarget.name}</p>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            {resetError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3">{resetError}</p>}
            <label className="block text-xs font-medium text-foreground mb-1">{tr('New Password')} <span className="text-destructive">*</span></label>
            <div className="relative mb-4">
              <input
                type={showResetPw ? 'text' : 'password'}
                placeholder={tr('New password (min 6 characters)')}
                required
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowResetPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showResetPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                {tr('Cancel')}
              </button>
              <button onClick={handleResetPassword} disabled={resetSaving}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {resetSaving ? tr('Saving…') : tr('Set Password')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteTarget} title={tr('Remove Teacher')}
        message={`${tr('Are you sure you want to delete')} ${deleteTarget?.name}?`}
        confirmLabel={tr('Remove')} confirmColor="red"
        onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
