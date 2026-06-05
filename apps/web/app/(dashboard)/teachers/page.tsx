'use client'
import { useEffect, useState } from 'react'
import { getTeachersApi, createTeacherApi, updateTeacherApi, deleteTeacherApi, getTeacherSubjectsApi, assignTeacherSubjectsApi } from '@/lib/api/teachers'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getClassLevelsApi } from '@/lib/api/classLevels'
import { School, Plus, Trash2, X, Eye, EyeOff, BookOpen, Info, Pencil, KeyRound } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { resetUserPasswordApi } from '@/lib/api/auth'

interface Teacher { id: string; name: string; email: string; role: string; masterClassLevel?: string | null; createdAt: string }
interface Subject { id: string; name: string; classLevel: string }

const emptyForm = { name: '', email: '', password: '', role: 'CLASS_TEACHER', masterClassLevel: '' }

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
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  const [classLevels, setClassLevels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [editForm, setEditForm] = useState({ role: '', masterClassLevel: '' })
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

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [td, sd, clData] = await Promise.all([getTeachersApi(), getSubjectsApi(), getClassLevelsApi()])
      setTeachers(td.teachers)
      setAllSubjects(sd.subjects)
      setClassLevels(clData.classLevels.sort((a: any, b: any) => a.order - b.order).map((cl: any) => cl.name))
    } catch {
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.role === 'CLASS_MASTER' && !form.masterClassLevel) {
      setError('Please select the class this person is master of')
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
      })
      setShowModal(false)
      setForm(emptyForm)
      fetchAll()
      showToast('Teacher added successfully')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Failed to create teacher')
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
      showToast('Teacher removed')
    } catch {
      showToast('Failed to remove teacher', 'error')
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 6) { setResetError('Password must be at least 6 characters'); return }
    setResetSaving(true)
    setResetError('')
    try {
      await resetUserPasswordApi(resetTarget.id, resetPassword)
      showToast(`Password updated for ${resetTarget.name}`)
      setResetTarget(null)
      setResetPassword('')
    } catch (e: any) {
      setResetError(e.response?.data?.message || 'Failed to reset password')
    } finally {
      setResetSaving(false)
    }
  }

  const openEditModal = (teacher: Teacher) => {
    setEditTarget(teacher)
    setEditForm({ role: teacher.role, masterClassLevel: teacher.masterClassLevel ?? '' })
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    if (editForm.role === 'CLASS_MASTER' && !editForm.masterClassLevel) {
      setEditError('Please select the class they are master of')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const result = await updateTeacherApi(editTarget.id, {
        role: editForm.role,
        masterClassLevel: editForm.role === 'CLASS_MASTER' ? editForm.masterClassLevel : null,
      })
      setEditTarget(null)
      fetchAll()
      if (result.displaced) showToast(result.displaced)
      else showToast('Teacher updated')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setEditError(e.response?.data?.message || 'Failed to update teacher')
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
        showToast('Subjects assigned successfully')
        setAssignTarget(null)
      }
    } catch {
      showToast('Failed to assign subjects', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const grouped = allSubjects.reduce<Record<string, Subject[]>>((acc, s) => {
    if (!acc[s.classLevel]) acc[s.classLevel] = []
    acc[s.classLevel].push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Teachers</h2>
          <p className="text-muted-foreground text-sm mt-1">{teachers.length} total staff members</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> Add Teacher
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-12">
            <School size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No teachers yet.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Master Of</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Joined</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teachers.map((t) => (
                <tr key={t.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {t.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{t.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColors[t.role] || 'bg-muted text-muted-foreground'}`}>
                      {roleLabels[t.role] || t.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {t.masterClassLevel
                      ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">{t.masterClassLevel}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openAssignModal(t)}
                        className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/10 px-2 py-1.5 rounded transition">
                        <BookOpen size={12} /> Subjects
                      </button>
                      <button onClick={() => openEditModal(t)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition" title="Edit role / class">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => { setResetTarget(t); setResetPassword(''); setResetError(''); setShowResetPw(false) }}
                        className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 rounded transition" title="Reset password">
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
          </table>
        )}
      </div>

      {/* Add Teacher Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">Add Teacher</h3>
              <button onClick={() => { setShowModal(false); setError('') }} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Full Name</label>
                <input type="text" placeholder="Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Email</label>
                <input type="email" placeholder="jane@school.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, masterClassLevel: '' })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="CLASS_TEACHER">Class Teacher</option>
                  <option value="CLASS_MASTER">Class Master</option>
                </select>
              </div>
              {form.role === 'CLASS_MASTER' && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Class they are Master of</label>
                  <select value={form.masterClassLevel} onChange={(e) => setForm({ ...form, masterClassLevel: e.target.value })} required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                    <option value="">Select a class</option>
                    {classLevels.map(cl => (
                      <option key={cl} value={cl}>{cl}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">This is the class they write general remarks for.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? 'Adding...' : 'Add Teacher'}
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
                <h3 className="font-semibold text-foreground text-lg">Assign Subjects</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{assignTarget.name} · {roleLabels[assignTarget.role]}</p>
              </div>
              <button onClick={() => setAssignTarget(null)} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>

            {/* Reassignment notice */}
            {reassignedInfo.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">Subjects reassigned:</p>
                    {reassignedInfo.map((msg, i) => (
                      <p key={i} className="text-xs text-amber-700">{msg}</p>
                    ))}
                    <button onClick={() => { setReassignedInfo([]); setAssignTarget(null); showToast('Subjects assigned successfully') }}
                      className="mt-2 text-xs text-amber-800 font-semibold underline">
                      OK, got it
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4">
              {Object.entries(grouped).map(([classLevel, subjects]) => (
                <div key={classLevel}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{classLevel}</p>
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
              {allSubjects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No subjects found. Add subjects first.</p>}
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
              <button onClick={() => setAssignTarget(null)}
                className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">Cancel</button>
              <button onClick={handleAssignSave} disabled={assigning || reassignedInfo.length > 0}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {assigning ? 'Saving...' : `Save (${assignedIds.length} subjects)`}
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
                <h3 className="font-semibold text-foreground text-lg">Edit Teacher</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{editTarget.name}</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>
            {editError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{editError}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Role</label>
                <select value={editForm.role}
                  onChange={(e) => setEditForm({ role: e.target.value, masterClassLevel: '' })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="CLASS_TEACHER">Class Teacher</option>
                  <option value="CLASS_MASTER">Class Master</option>
                </select>
              </div>
              {editForm.role === 'CLASS_MASTER' && (
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Class they are Master of</label>
                  <select value={editForm.masterClassLevel}
                    onChange={(e) => setEditForm({ ...editForm, masterClassLevel: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                    <option value="">Select a class</option>
                    {classLevels.map(cl => (
                      <option key={cl} value={cl}>{cl}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">If another person is already master of this class, they will become a Class Teacher.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {editSaving ? 'Saving...' : 'Save Changes'}
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
                <h3 className="font-semibold text-foreground">Reset Password</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{resetTarget.name}</p>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            {resetError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3">{resetError}</p>}
            <div className="relative mb-4">
              <input
                type={showResetPw ? 'text' : 'password'}
                placeholder="New password (min 6 characters)"
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
                Cancel
              </button>
              <button onClick={handleResetPassword} disabled={resetSaving}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {resetSaving ? 'Saving…' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteTarget} title="Remove Teacher"
        message={`Are you sure you want to remove ${deleteTarget?.name}?`}
        confirmLabel="Remove" confirmColor="red"
        onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
