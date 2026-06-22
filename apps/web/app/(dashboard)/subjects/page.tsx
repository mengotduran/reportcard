'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getSubjectsApi, createSubjectApi, deleteSubjectApi, updateSubjectApi } from '@/lib/api/subjects'
import { getClassLevelsApi, ClassLevel as ClassLevelOption } from '@/lib/api/classLevels'
import { BookOpen, Plus, Trash2, Pencil, X, Check, AlertTriangle, ArrowLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface Subject {
  id: string
  name: string
  classLevel: string
  maxScore: number
  coefficient: number
}

export default function SubjectsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const t = useT()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classLevels, setClassLevels] = useState<ClassLevelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', coefficient: '1' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', coefficient: '1' })

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    Promise.all([
      getSubjectsApi().then(d => setSubjects(d.subjects)),
      getClassLevelsApi().then(d => setClassLevels(d.classLevels.sort((a, b) => a.order - b.order))),
    ]).finally(() => setLoading(false))
  }, [isAuthenticated])

  const fetchSubjects = () =>
    getSubjectsApi().then(d => setSubjects(d.subjects)).catch(() => {})

  const classSubjects = selectedClass
    ? subjects.filter(s => s.classLevel === selectedClass)
    : []

  // Grouped counts for the class picker
  const countByClass = subjects.reduce((acc, s) => {
    acc[s.classLevel] = (acc[s.classLevel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openModal = () => {
    setForm({ name: '', coefficient: '1' })
    setFormError('')
    setShowModal(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClass) return
    setFormError('')
    setSaving(true)
    try {
      await createSubjectApi({
        name: form.name.trim(),
        classLevel: selectedClass,
        coefficient: Number(form.coefficient),
      })
      setShowModal(false)
      fetchSubjects()
    } catch (err: any) {
      setFormError(err.response?.data?.message || t('Failed to create subject'))
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (s: Subject) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, coefficient: String(s.coefficient ?? 1) })
  }

  const handleEdit = async (id: string) => {
    try {
      await updateSubjectApi(id, {
        name: editForm.name.trim(),
        coefficient: Number(editForm.coefficient),
      })
      setEditingId(null)
      fetchSubjects()
    } catch { /* silently ignore */ }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSubjectApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchSubjects()
    } catch { /* silently ignore */ }
    finally { setDeleting(false) }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>
  }

  // ── Class picker ─────────────────────────────────────────────────────────
  if (!selectedClass) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">{t('Subjects')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Select a class to manage its subjects')}</p>
        </div>

        {classLevels.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <BookOpen size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t('No classes found.')}</p>
            <button onClick={() => router.push('/classes')} className="mt-3 text-primary text-sm hover:underline">
              {t('Go to Classes →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classLevels.map(cl => {
              const count = countByClass[cl.name] ?? 0
              return (
                <button
                  key={cl.id}
                  onClick={() => setSelectedClass(cl.name)}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-bold text-sm">
                      {cl.name.charAt(0)}
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <p className="font-semibold text-foreground">{cl.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {count === 0 ? t('No subjects yet') : `${count} ${count !== 1 ? t('subjects') : t('subject')}`}
                  </p>
                  <p className="text-xs text-primary font-medium mt-1">{t('Max score:')} / {cl.maxScore ?? 20}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Subject table for selected class ────────────────────────────────────
  const classMaxScore = classLevels.find(cl => cl.name === selectedClass)?.maxScore ?? 20

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { setSelectedClass(null); setEditingId(null) }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-foreground">{selectedClass}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {classSubjects.length} {classSubjects.length !== 1 ? t('subjects') : t('subject')}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition"
        >
          <Plus size={16} /> {t('Add Subject')}
        </button>
      </div>

      {/* Subjects table */}
      {classSubjects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-14">
          <BookOpen size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">{t('No subjects for')} <strong>{selectedClass}</strong> {t('yet.')}</p>
          <button onClick={openModal}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
            <Plus size={15} /> {t('Add First Subject')}
          </button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Subject')}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  {t('Max Score')} <span className="font-bold text-primary normal-case">/ {classMaxScore}</span>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('Coefficient')}</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classSubjects.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40 transition">
                  {/* Subject name */}
                  <td className="px-5 py-3">
                    {editingId === s.id ? (
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-foreground">{s.name}</span>
                      </div>
                    )}
                  </td>

                  {/* Max score — same for all subjects, shown once in the header */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-muted-foreground">—</span>
                  </td>

                  {/* Coefficient */}
                  <td className="px-4 py-3 text-center">
                    {editingId === s.id ? (
                      <input
                        type="number" min="1" max="10"
                        value={editForm.coefficient}
                        onChange={(e) => setEditForm({ ...editForm, coefficient: e.target.value })}
                        className="border border-border rounded-lg px-2 py-1.5 text-sm w-16 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                        ×{s.coefficient ?? 1}
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {editingId === s.id ? (
                        <>
                          <button onClick={() => handleEdit(s.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition" title={t('Save')}>
                            <Check size={15} />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition" title={t('Cancel')}>
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(s)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition" title={t('Edit')}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTarget(s)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition" title={t('Delete')}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Add subject modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{t('Add Subject')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('Class:')} <span className="font-semibold text-foreground">{selectedClass}</span></p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Subject Name')}</label>
                <input
                  type="text" placeholder="e.g. Mathematics"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required autoFocus
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Coefficient')}</label>
                <input
                  type="number" min="1" max="10" placeholder="1"
                  value={form.coefficient}
                  onChange={(e) => setForm({ ...form, coefficient: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('Weight of this subject in the final average. Max score is inherited from the class.')}</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-muted transition">
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving…') : t('Add Subject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{t('Delete Subject')}</h3>
                <p className="text-xs text-muted-foreground">{t('This cannot be undone.')}</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-5">
              {t('Are you sure you want to delete')} <span className="font-semibold">"{deleteTarget.name}"</span>? {t('All report entries for this subject will also be removed.')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-muted transition disabled:opacity-50">
                {t('Cancel')}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-destructive text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                {deleting ? t('Deleting…') : t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
