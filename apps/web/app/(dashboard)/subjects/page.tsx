'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getSubjectsApi, createSubjectApi, deleteSubjectApi, updateSubjectApi } from '@/lib/api/subjects'
import { getClassLevelsApi, ClassLevel as ClassLevelOption } from '@/lib/api/classLevels'
import { getTermsApi } from '@/lib/api/terms'
import { BookOpen, Plus, Trash2, Pencil, X, Check, AlertTriangle, ArrowLeft, ChevronRight, Calendar } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface Subject {
  id: string
  name: string
  code?: string | null
  classLevel: string
  maxScore: number
  coefficient: number
  credit?: number | null
  term?: string | null
}

interface TermOption { id: string; name: string; session: string; startDate: string }

export default function SubjectsPage() {
  const router = useRouter()
  const { isAuthenticated, school, activeSession } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const t = useT()
  // Universities call subjects "courses" and classes "departments" — same data/routes, just different wording.
  const tt = (subjectStr: string, courseStr: string) => t(isUniversity ? courseStr : subjectStr)
  const tc = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classLevels, setClassLevels] = useState<ClassLevelOption[]>([])
  const [terms, setTerms] = useState<TermOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  // University only — a course belongs to one semester (see Subject.term in schema.prisma).
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null)

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', coefficient: '1', credit: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', coefficient: '1', credit: '' })

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    Promise.all([
      getSubjectsApi().then(d => setSubjects(d.subjects)),
      getClassLevelsApi().then(d => setClassLevels(d.classLevels.sort((a, b) => a.order - b.order))),
      getTermsApi().then(d => setTerms(d.terms)),
    ]).finally(() => setLoading(false))
  }, [isAuthenticated])

  const fetchSubjects = () =>
    getSubjectsApi().then(d => setSubjects(d.subjects)).catch(() => {})

  // Semesters available to pick from — distinct names within the active academic
  // session, ordered by start date (so "First Semester" lists before "Second").
  const availableTerms = Array.from(
    new Map(
      terms.filter(tm => tm.session === activeSession).map(tm => [tm.name, tm])
    ).values()
  ).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  const classSubjects = selectedClass
    ? subjects.filter(s => s.classLevel === selectedClass && (!isUniversity || s.term === selectedTerm))
    : []

  // Grouped counts for the class picker
  const countByClass = subjects.reduce((acc, s) => {
    acc[s.classLevel] = (acc[s.classLevel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openModal = () => {
    setForm({ name: '', code: '', coefficient: '1', credit: '' })
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
        ...(isUniversity && form.code.trim() ? { code: form.code.trim().toUpperCase() } : {}),
        // Universities don't enter a separate coefficient — credit hours double as
        // the weight in the average, same value the seed already uses for this.
        coefficient: isUniversity ? (Number(form.credit) || 1) : Number(form.coefficient),
        ...(isUniversity ? { credit: form.credit === '' ? null : Number(form.credit), term: selectedTerm } : {}),
      })
      setShowModal(false)
      fetchSubjects()
    } catch (err: any) {
      setFormError(err.response?.data?.message || tt('Failed to create subject', 'Failed to create course'))
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (s: Subject) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, code: s.code ?? '', coefficient: String(s.coefficient ?? 1), credit: s.credit != null ? String(s.credit) : '' })
  }

  const handleEdit = async (id: string) => {
    try {
      await updateSubjectApi(id, {
        name: editForm.name.trim(),
        ...(isUniversity ? { code: editForm.code.trim().toUpperCase() || null } : {}),
        coefficient: isUniversity ? (Number(editForm.credit) || 1) : Number(editForm.coefficient),
        ...(isUniversity ? { credit: editForm.credit === '' ? null : Number(editForm.credit) } : {}),
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
          <h2 className="text-2xl font-bold text-foreground">{tt('Subjects', 'Courses')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{isUniversity ? t('Select a department to manage its courses') : t('Select a class to manage its subjects')}</p>
        </div>

        {classLevels.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <BookOpen size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{tc('No classes found.', 'No departments found.')}</p>
            <button onClick={() => router.push('/classes')} className="mt-3 text-primary text-sm hover:underline">
              {tc('Go to Classes →', 'Go to Departments →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classLevels.map(cl => {
              const count = countByClass[cl.name] ?? 0
              return (
                <button
                  key={cl.id}
                  onClick={() => { setSelectedClass(cl.name); setSelectedTerm(null) }}
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
                    {count === 0 ? tt('No subjects yet', 'No courses yet') : `${count} ${count !== 1 ? tt('subjects', 'courses') : tt('subject', 'course')}`}
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

  // ── Semester picker (university only) — a course belongs to one semester ───
  if (isUniversity && !selectedTerm) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedClass(null)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{selectedClass}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{t('Select a semester to manage its courses')}</p>
          </div>
        </div>

        {availableTerms.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <Calendar size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t('No semesters found for the active academic year.')}</p>
            <button onClick={() => router.push('/terms')} className="mt-3 text-primary text-sm hover:underline">
              {t('Go to Semesters →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTerms.map(tm => {
              const count = subjects.filter(s => s.classLevel === selectedClass && s.term === tm.name).length
              return (
                <button
                  key={tm.id}
                  onClick={() => setSelectedTerm(tm.name)}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center">
                      <Calendar size={18} />
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <p className="font-semibold text-foreground">{tm.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {count === 0 ? t('No courses yet') : `${count} ${count !== 1 ? t('courses') : t('course')}`}
                  </p>
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
          onClick={() => { if (isUniversity) setSelectedTerm(null); else setSelectedClass(null); setEditingId(null) }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-foreground">{selectedClass}{isUniversity && <span className="text-muted-foreground font-normal"> · {selectedTerm}</span>}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {classSubjects.length} {classSubjects.length !== 1 ? tt('subjects', 'courses') : tt('subject', 'course')}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition"
        >
          <Plus size={16} /> {tt('Add Subject', 'Add Course')}
        </button>
      </div>

      {/* Subjects table */}
      {classSubjects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-14">
          <BookOpen size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">{tt('No subjects for', 'No courses for')} <strong>{selectedClass}</strong> {t('yet.')}</p>
          <button onClick={openModal}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
            <Plus size={15} /> {tt('Add First Subject', 'Add First Course')}
          </button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tt('Subject', 'Course')}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  {t('Max Score')} <span className="font-bold text-primary normal-case">/ {classMaxScore}</span>
                </th>
                {!isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('Coefficient')}</th>}
                {isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">{t('Credit')}</th>}
                {isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('Code')}</th>}
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

                  {/* Coefficient (not university) */}
                  {!isUniversity && (
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
                  )}

                  {/* Credit (university) */}
                  {isUniversity && (
                    <td className="px-4 py-3 text-center">
                      {editingId === s.id ? (
                        <input
                          type="number" min="0" step="1" placeholder="—"
                          value={editForm.credit}
                          onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })}
                          className="border border-border rounded-lg px-2 py-1.5 text-sm w-16 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        />
                      ) : (
                        <span className="text-sm font-medium text-foreground">{s.credit ?? '—'}</span>
                      )}
                    </td>
                  )}

                  {/* Course code (university) */}
                  {isUniversity && (
                    <td className="px-4 py-3 text-center">
                      {editingId === s.id ? (
                        <input
                          type="text" placeholder="e.g. CS101"
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                          className="border border-border rounded-lg px-2 py-1.5 text-sm w-24 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground font-mono"
                          maxLength={12}
                        />
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">{s.code ?? '—'}</span>
                      )}
                    </td>
                  )}

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
                <h3 className="font-semibold text-foreground text-lg">{tt('Add Subject', 'Add Course')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tc('Class:', 'Department:')} <span className="font-semibold text-foreground">{selectedClass}</span>
                  {isUniversity && <> · {t('Semester:')} <span className="font-semibold text-foreground">{selectedTerm}</span></>}
                </p>
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
                <label className="block text-xs font-medium text-foreground mb-1">{tt('Subject Name', 'Course Name')}</label>
                <input
                  type="text" placeholder={isUniversity ? 'e.g. Calculus I' : 'e.g. Mathematics'}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required autoFocus
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {!isUniversity && (
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
              )}

              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Course Code')}</label>
                  <input
                    type="text" placeholder="e.g. CS101"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    maxLength={12}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Short identifier shown in the transcript (e.g. MATH201).')}</p>
                </div>
              )}

              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Credit hours')}</label>
                  <input
                    type="number" min="0" step="1" placeholder="e.g. 3"
                    value={form.credit}
                    onChange={(e) => setForm({ ...form, credit: e.target.value })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Credit value of this course — drives the GPA on the transcript and its weight in the average.')}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-muted transition">
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving…') : tt('Add Subject', 'Add Course')}
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
                <h3 className="font-semibold text-foreground">{tt('Delete Subject', 'Delete Course')}</h3>
                <p className="text-xs text-muted-foreground">{t('This cannot be undone.')}</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-5">
              {t('Are you sure you want to delete')} <span className="font-semibold">"{deleteTarget.name}"</span>? {tt('All report entries for this subject will also be removed.', 'All report entries for this course will also be removed.')}
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
