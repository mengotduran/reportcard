'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getStudentsApi, getStudentClassLevelsApi, createStudentApi, updateStudentApi, deleteStudentApi } from '@/lib/api/students'
import { getClassLevelsApi, ClassLevel } from '@/lib/api/classLevels'
import { Users, Plus, Search, Trash2, Pencil, X } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'

interface Student {
  id: string; name: string; studentId: string
  classLevel: string; guardianName?: string
  guardianPhone?: string; guardianEmail?: string
}

const emptyForm = { name: '', studentId: '', classLevel: '', stream: '', guardianName: '', guardianPhone: '', guardianEmail: '' }

export default function StudentsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const [students, setStudents] = useState<Student[]>([])
  const [filterClasses, setFilterClasses] = useState<string[]>([])
  const [definedClasses, setDefinedClasses] = useState<ClassLevel[]>([])
  const [activeClass, setActiveClass] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else {
      fetchStudents()
      fetchFilterClasses()
      fetchDefinedClasses()
    }
  }, [isAuthenticated])

  const fetchFilterClasses = async () => {
    try {
      const data = await getStudentClassLevelsApi()
      setFilterClasses(data.classLevels)
    } catch { /* ignore */ }
  }

  const fetchDefinedClasses = async () => {
    try {
      const data = await getClassLevelsApi()
      setDefinedClasses(data.classLevels)
    } catch { /* ignore */ }
  }

  const fetchStudents = async (classFilter?: string, searchVal?: string) => {
    try {
      setLoading(true)
      const params: { classLevel?: string; search?: string } = {}
      if (classFilter && classFilter !== 'all') params.classLevel = classFilter
      if (searchVal) params.search = searchVal
      const data = await getStudentsApi(params)
      setStudents(data.students)
    } catch { console.error('Failed to fetch students') }
    finally { setLoading(false) }
  }

  const handleClassFilter = (cls: string) => {
    setActiveClass(cls)
    setSearch('')
    fetchStudents(cls)
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    fetchStudents(activeClass, e.target.value)
  }

  const selectedClassDef = definedClasses.find((c) => c.name === form.classLevel)
  const needsStream = selectedClassDef?.hasStream ?? false

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (s: Student) => {
    const streams = ['Arts', 'Science']
    const parts = s.classLevel.split(' ')
    const stream = streams.includes(parts[parts.length - 1]) ? parts[parts.length - 1] : ''
    const baseClass = stream ? parts.slice(0, -1).join(' ') : s.classLevel
    setEditingId(s.id)
    setForm({
      name: s.name,
      studentId: s.studentId,
      classLevel: baseClass,
      stream,
      guardianName: s.guardianName || '',
      guardianPhone: s.guardianPhone || '',
      guardianEmail: s.guardianEmail || '',
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setError('')
    setForm(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (needsStream && !form.stream) {
      setError('Please select a stream (Arts or Science)')
      return
    }
    setSaving(true)
    try {
      const classLevel = needsStream ? `${form.classLevel} ${form.stream}` : form.classLevel
      const { stream, studentId: _sid, ...rest } = form
      if (editingId) {
        await updateStudentApi(editingId, { ...rest, classLevel })
        showToast('Student updated')
      } else {
        await createStudentApi({ ...rest, classLevel })
        showToast('Student added successfully')
      }
      closeModal()
      fetchStudents(activeClass)
      fetchFilterClasses()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Failed to save student')
    } finally { setSaving(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteStudentApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchStudents(activeClass)
      fetchFilterClasses()
      showToast('Student deleted')
    } catch {
      showToast('Failed to delete student', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Students</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {students.length} {activeClass !== 'all' ? `in ${activeClass}` : 'total students'}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> Add Student
        </button>
      </div>

      {filterClasses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleClassFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeClass === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
            All
          </button>
          {filterClasses.map((cls) => (
            <button key={cls} onClick={() => handleClassFilter(cls)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeClass === cls ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search students..." value={search} onChange={handleSearch}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <Users size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No students yet.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Student ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Class</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Guardian</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                        {s.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.studentId}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.classLevel}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.guardianName || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{editingId ? 'Edit Student' : 'Add Student'}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground ">
                <X size={20} />
              </button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Full Name</label>
                <input type="text" placeholder="e.g. Nguemo Alice"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {/* Student ID is auto-generated by the server — not shown on create */}
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Student ID (auto-generated)</label>
                  <input type="text" value={form.studentId} disabled
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Class</label>
                {definedClasses.length > 0 ? (
                  <select
                    value={form.classLevel}
                    onChange={(e) => setForm({ ...form, classLevel: e.target.value, stream: '' })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select class</option>
                    {definedClasses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted dark:bg-card">
                    No classes defined yet — go to the Classes page to add them.
                  </div>
                )}
              </div>
              {needsStream && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-2">Stream</label>
                  <div className="flex gap-6">
                    {['Arts', 'Science'].map((s) => (
                      <label key={s} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="stream" value={s}
                          checked={form.stream === s}
                          onChange={() => setForm({ ...form, stream: s })}
                          className="accent-primary" />
                        <span className="text-sm text-foreground">{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {[
                { name: 'guardianName', label: 'Guardian Name', placeholder: 'e.g. Nguemo Jean' },
                { name: 'guardianPhone', label: 'Guardian Phone', placeholder: 'e.g. 677000000' },
                { name: 'guardianEmail', label: 'Guardian Email', placeholder: 'e.g. guardian@email.com' },
              ].map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-medium text-foreground mb-1">{field.label}</label>
                  <input type="text" placeholder={field.placeholder}
                    value={form[field.name as keyof typeof emptyForm]}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Student"
        message={`Are you sure you want to delete ${deleteTarget?.name}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
