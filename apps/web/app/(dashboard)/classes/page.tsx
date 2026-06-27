'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getClassLevelsApi, createClassLevelApi, updateClassLevelApi, deleteClassLevelApi, ClassLevel } from '@/lib/api/classLevels'
import { GraduationCap, Plus, Pencil, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'
import { formatXAF } from '@/lib/api/fees'

const emptyForm = { name: '', abbreviation: '', hasStream: false, maxScore: '20', feeAmount: '150000' }

export default function ClassesPage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'
  // Universities call classes "departments" — same data/route, just different wording.
  const tt = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [classes, setClasses] = useState<ClassLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ClassLevel | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ClassLevel | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else fetchClasses()
  }, [isAuthenticated])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const data = await getClassLevelsApi()
      setClasses(data.classLevels)
    } catch { console.error('Failed to fetch classes') }
    finally { setLoading(false) }
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (cls: ClassLevel) => {
    setEditing(cls)
    setForm({ name: cls.name, abbreviation: cls.abbreviation ?? '', hasStream: cls.hasStream, maxScore: String(cls.maxScore ?? 20), feeAmount: String(cls.feeAmount ?? 0) })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.feeAmount.trim() === '' || isNaN(Number(form.feeAmount)) || Number(form.feeAmount) < 0) {
      setError(tt('Enter the class fee (use 0 if there is none).', 'Enter the department fee (use 0 if there is none).'))
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateClassLevelApi(editing.id, { ...form, abbreviation: form.abbreviation.trim() || undefined, maxScore: Number(form.maxScore), feeAmount: Number(form.feeAmount) || 0 })
        showToast(tt('Class updated', 'Department updated'))
      } else {
        await createClassLevelApi({ ...form, abbreviation: form.abbreviation.trim() || undefined, maxScore: Number(form.maxScore), feeAmount: Number(form.feeAmount) || 0, order: classes.length })
        showToast(tt('Class added', 'Department added'))
      }
      closeModal()
      fetchClasses()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || tt('Failed to save class', 'Failed to save department'))
    } finally { setSaving(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteClassLevelApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchClasses()
      showToast(tt('Class deleted', 'Department deleted'))
    } catch {
      showToast(tt('Failed to delete class', 'Failed to delete department'), 'error')
    }
  }

  const moveClass = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= classes.length) return
    const updated = [...classes]
    ;[updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]]
    setClasses(updated)
    try {
      await Promise.all([
        updateClassLevelApi(updated[index].id, { order: index }),
        updateClassLevelApi(updated[swapIndex].id, { order: swapIndex }),
      ])
    } catch {
      fetchClasses()
    }
  }

  const { page, setPage, totalPages, pageItems, total, pageSize, start } = usePagination(classes, 15)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tt('Classes', 'Departments')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{classes.length} {classes.length !== 1 ? tt('classes defined', 'departments defined') : tt('class defined', 'department defined')}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> {tt('Add Class', 'Add Department')}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
        ) : classes.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{tt('No classes yet. Add your first class to get started.', 'No departments yet. Add your first department to get started.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Order')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tt('Class Name', 'Department Name')}</th>
                {isUniversity && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Abbr.')}</th>}
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Max Score')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Fee')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Stream')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((cls, idx) => {
                const i = start + idx
                return (
                <tr key={cls.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveClass(i, 'up')} disabled={i === 0}
                        className="p-0.5 text-muted-foreground hover:text-muted-foreground disabled:opacity-20 transition">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => moveClass(i, 'down')} disabled={i === classes.length - 1}
                        className="p-0.5 text-muted-foreground hover:text-muted-foreground disabled:opacity-20 transition">
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm font-medium text-foreground">{cls.name}</span>
                    </div>
                  </td>
                  {isUniversity && (
                    <td className="px-4 py-3">
                      {cls.abbreviation
                        ? <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{cls.abbreviation}</span>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-primary">/ {cls.maxScore ?? 20}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {cls.feeAmount > 0
                      ? <span className="text-sm font-medium text-foreground">{formatXAF(cls.feeAmount)}</span>
                      : <span className="text-muted-foreground text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {cls.hasStream ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                        {t('Arts')} / {t('Science')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(cls)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget(cls)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{editing ? tt('Edit Class', 'Edit Department') : tt('Add Class', 'Add Department')}</h3>
              <button onClick={closeModal} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tt('Class Name', 'Department Name')}</label>
                <input type="text" placeholder={isUniversity ? 'e.g. HND Computer Science - Level 1' : 'e.g. Form 3, Class 5, Lower Sixth'}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Department Abbreviation')} <span className="text-muted-foreground font-normal">(used in student matricule)</span></label>
                  <input type="text" placeholder="e.g. HWM, SWE, MF"
                    value={form.abbreviation}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })}
                    maxLength={10}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">{t('Short code that appears in new student IDs. If left blank the system will auto-generate one.')}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{isUniversity ? t('Max Score per Course') : t('Max Score per Subject')}</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t('out of')}</span>
                  <input
                    type="number" min="1" max="1000" placeholder="20"
                    value={form.maxScore}
                    onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                    required
                    className="w-24 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tt('All subjects in this class will use this as their maximum mark.', 'All courses in this department will use this as their maximum mark.')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('School Fee (XAF)')} <span className="text-destructive">*</span></label>
                <input
                  type="number" min="0" step="any" placeholder="150000" required
                  value={form.feeAmount}
                  onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">{tt('Total fee for this class per academic year. Record each student’s payments from the Students page.', 'Total fee for this department per academic year. Record each student’s payments from the Students page.')}</p>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm({ ...form, hasStream: !form.hasStream })}
                    className={`relative w-10 h-6 rounded-full transition-colors ${form.hasStream ? 'bg-primary' : 'bg-zinc-400 dark:bg-zinc-600'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.hasStream ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('Has stream (Arts / Science)')}</p>
                    <p className="text-xs text-muted-foreground">{tt('Students in this class must choose a stream', 'Students in this department must choose a stream')}</p>
                  </div>
                </label>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">{t('Cancel')}</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving...') : editing ? t('Save Changes') : tt('Add Class', 'Add Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={tt('Delete Class', 'Delete Department')}
        message={`${t('Are you sure you want to delete')} "${deleteTarget?.name}"? ${t('This cannot be undone.')}`}
        confirmLabel={t('Delete')}
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
