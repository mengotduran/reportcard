'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getCurrentTermApi, getClassOverviewApi, getReportCardApi, updateRemarksApi } from '@/lib/api/reportcards'
import { getMeApi } from '@/lib/api/auth'
import { MessageSquare, CheckCircle, Clock, X, Save } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'

interface Student {
  id: string
  name: string
  studentId: string
  classLevel: string
  reportCard: { id: string; status: string; average: number | null; remarks: string | null; remarksEditGrantedTo: string | null; allSeqsFilled?: boolean } | null
}

export default function ClassMasterPage() {
  const router = useRouter()
  const { isAuthenticated, user, updateUser } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()

  const masterClass = user?.masterClassLevel ?? ''
  const [term, setTerm] = useState<{ id: string; name: string; session: string } | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Student | null>(null)
  const [remarksText, setRemarksText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    // masterClassLevel might be missing if user logged in before the field was added to the login response
    const cls = user?.masterClassLevel
    if (cls) {
      loadInitial(cls)
    } else {
      getMeApi().then(me => {
        if (me.masterClassLevel) {
          updateUser({ masterClassLevel: me.masterClassLevel })
          loadInitial(me.masterClassLevel)
        } else {
          setLoading(false)
        }
      }).catch(() => setLoading(false))
    }
  }, [isAuthenticated])

  const loadInitial = async (cls?: string) => {
    const classLevel = cls ?? masterClass
    if (!classLevel) { setLoading(false); return }
    try {
      const { term: t } = await getCurrentTermApi()
      setTerm(t)
      await loadStudents(t.id, classLevel)
    } catch {
      showToast('Failed to load data', 'error')
    } finally { setLoading(false) }
  }

  const loadStudents = useCallback(async (termId: string, classLevel: string) => {
    setLoading(true)
    try {
      const overview = await getClassOverviewApi(termId, classLevel)
      // Fetch remarks for each student that has a report card
      const enriched: Student[] = await Promise.all(
        overview.students.map(async (s) => {
          if (!s.reportCard) return { ...s, reportCard: null }
          try {
            const rc = await getReportCardApi(s.reportCard.id)
            const allSeqsFilled = rc.entries?.length > 0 &&
              rc.entries.every((e: any) => e.seq1Score != null && e.seq2Score != null)
            return { ...s, reportCard: { ...s.reportCard, remarks: rc.remarks ?? null, allSeqsFilled } }
          } catch { return { ...s, reportCard: { ...s.reportCard, remarks: null, allSeqsFilled: false } } }
        })
      )
      setStudents(enriched)
    } catch {
      showToast('Failed to load students', 'error')
    } finally { setLoading(false) }
  }, [])

  const openEdit = (student: Student) => {
    setEditTarget(student)
    setRemarksText(student.reportCard?.remarks ?? '')
  }

  const handleSaveRemarks = async () => {
    if (!editTarget?.reportCard) return
    setSaving(true)
    try {
      await updateRemarksApi(editTarget.reportCard.id, remarksText)
      showToast('Remarks saved')
      setStudents(prev => prev.map(s =>
        s.id === editTarget.id
          ? { ...s, reportCard: s.reportCard ? { ...s.reportCard, remarks: remarksText } : null }
          : s
      ))
      setEditTarget(null)
    } catch {
      showToast('Failed to save remarks', 'error')
    } finally { setSaving(false) }
  }

  const filledCount = students.filter(s => s.reportCard && (s.reportCard.remarks ?? '').trim().length > 0).length

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground">Class Master — {masterClass}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {term ? `${term.name} — ${term.session}` : 'No active term'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
          <MessageSquare size={15} />
          <span>{filledCount}/{students.length} remarks filled</span>
        </div>
      </div>

      {!masterClass ? (
        <div className="bg-card rounded-xl border border-border text-center py-12 text-muted-foreground text-sm">
          No class assigned. Ask your admin to set your master class.
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading students...</div>
      ) : students.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12 text-muted-foreground text-sm">
          No students found for {masterClass}.
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Average</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Card Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">General Remarks</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s, i) => (
                <tr key={s.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.studentId}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {s.reportCard?.average != null ? s.reportCard.average.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {!s.reportCard ? (
                      <span className="text-xs text-muted-foreground">No card</span>
                    ) : s.reportCard.status === 'PUBLISHED' ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full w-fit">
                        <CheckCircle size={10} /> Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full w-fit">
                        <Clock size={10} /> Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {s.reportCard ? (
                      (s.reportCard.remarks ?? '').trim()
                        ? <p className="text-sm text-foreground truncate">{s.reportCard.remarks}</p>
                        : <span className="text-xs text-muted-foreground italic">No remarks yet</span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.reportCard && (() => {
                      const isLocked = s.reportCard.status === 'PUBLISHED' && s.reportCard.remarksEditGrantedTo !== user?.id
                      const isGranted = s.reportCard.remarksEditGrantedTo === user?.id
                      const seqsOk = s.reportCard.allSeqsFilled !== false
                      return isLocked ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5">
                          🔒 Locked
                        </span>
                      ) : !seqsOk ? (
                        <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg" title="All subject sequences must be filled before adding remarks">
                          ⚠ Marks incomplete
                        </span>
                      ) : (
                        <button onClick={() => openEdit(s)}
                          className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition ${isGranted ? 'border-primary/30 text-primary hover:bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                          <MessageSquare size={12} />
                          {isGranted ? '✏️ Edit (permitted)' : (s.reportCard.remarks ?? '').trim() ? 'Edit' : 'Add Remarks'}
                        </button>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Remarks edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">{editTarget.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{editTarget.classLevel} · General Remarks</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <textarea
              rows={5}
              value={remarksText}
              onChange={e => setRemarksText(e.target.value)}
              placeholder="e.g. This student has shown great improvement this term. Keep it up!"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditTarget(null)}
                className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">
                Cancel
              </button>
              <button onClick={handleSaveRemarks} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                <Save size={14} /> {saving ? 'Saving...' : 'Save Remarks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
