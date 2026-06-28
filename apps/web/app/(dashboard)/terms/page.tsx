'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getTermsApi, createTermApi, updateTermApi, setCurrentTermApi, deleteTermApi,
  endAcademicYearApi, startNewAcademicYearApi, NewYearTermDef,
} from '@/lib/api/terms'
import { Calendar, Plus, Trash2, Pencil, X, CheckCircle, AlertTriangle, PartyPopper, ArrowRight, BookOpen } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'

interface Term {
  id: string
  name: string
  session: string
  startDate: string
  endDate: string
  isCurrent: boolean
}

const emptyForm = { name: '', session: '', startDate: '', endDate: '' }

function suggestNextSession(sessions: string[]): string {
  for (const s of sessions) {
    const m = s.match(/^(\d{4})\/(\d{4})$/)
    if (m) return `${Number(m[2])}/${Number(m[2]) + 1}`
  }
  const y = new Date().getFullYear()
  return `${y}/${y + 1}`
}

const DEFAULT_TERM_NAMES = ['First Term', 'Second Term', 'Third Term']
const DEFAULT_SEM_NAMES  = ['First Semester', 'Second Semester']

export default function TermsPage() {
  const router = useRouter()
  const { isAuthenticated, activeSession, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'
  const tt = (termStr: string, semesterStr: string) => t(isUniversity ? semesterStr : termStr)

  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)

  // Edit / Add term modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // End-year confirmation modal
  const [showEndYear, setShowEndYear] = useState(false)
  const [endingYear, setEndingYear] = useState(false)

  // New-year wizard
  const [showNewYear, setShowNewYear] = useState(false)
  const defaultTermCount = isUniversity ? 2 : 3
  const defaultNames = isUniversity ? DEFAULT_SEM_NAMES : DEFAULT_TERM_NAMES
  const [nySession, setNySession] = useState('')
  const [nyTerms, setNyTerms] = useState<NewYearTermDef[]>([])
  const [startingYear, setStartingYear] = useState(false)
  const [nyError, setNyError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else fetchTerms()
  }, [isAuthenticated])

  const fetchTerms = async () => {
    try {
      setLoading(true)
      const data = await getTermsApi()
      setTerms(data.terms)
    } catch {
      console.error('Failed to fetch terms')
    } finally {
      setLoading(false)
    }
  }

  const toInputDate = (iso: string) => iso ? iso.split('T')[0] : ''

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyForm, session: activeSession ?? '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (term: Term) => {
    setEditingId(term.id)
    setForm({
      name: term.name,
      session: term.session,
      startDate: toInputDate(term.startDate),
      endDate: toInputDate(term.endDate),
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); setError('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editingId) await updateTermApi(editingId, form)
      else await createTermApi(form)
      closeModal()
      fetchTerms()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setError(e2.response?.data?.message || tt('Failed to save term', 'Failed to save semester'))
    } finally {
      setSaving(false)
    }
  }

  const handleSetCurrent = async (id: string) => {
    await setCurrentTermApi(id)
    fetchTerms()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${tt('Delete term', 'Delete semester')} "${name}"?`)) return
    await deleteTermApi(id)
    fetchTerms()
  }

  // ── End Year ──────────────────────────────────────────────────────────────
  const handleEndYear = async () => {
    setEndingYear(true)
    try {
      const result = await endAcademicYearApi()
      const msg = result.decisionsSet > 0
        ? `${result.session} closed · ${result.decisionsSet} report card${result.decisionsSet !== 1 ? 's' : ''} updated with PASS/REPEAT decisions`
        : `${result.session} closed`
      showToast(msg, 'success')
      setShowEndYear(false)
      fetchTerms()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      showToast(e2.response?.data?.message || 'Failed to end academic year', 'error')
    } finally {
      setEndingYear(false)
    }
  }

  // ── New Year ──────────────────────────────────────────────────────────────
  const openNewYear = () => {
    const sessions = [...new Set(terms.map((t) => t.session))].sort()
    const suggested = suggestNextSession(sessions)
    setNySession(suggested)
    setNyTerms(
      Array.from({ length: defaultTermCount }, (_, i) => ({
        name: defaultNames[i] ?? `${tt('Term', 'Semester')} ${i + 1}`,
        startDate: '',
        endDate: '',
      })),
    )
    setNyError('')
    setShowNewYear(true)
  }

  const handleStartYear = async () => {
    setNyError('')
    for (const td of nyTerms) {
      if (!td.startDate || !td.endDate) { setNyError('Please fill in all start and end dates.'); return }
    }
    setStartingYear(true)
    try {
      const result = await startNewAcademicYearApi(nySession, nyTerms)
      showToast(`${result.session} started — first ${tt('term', 'semester')} set as current`, 'success')
      setShowNewYear(false)
      fetchTerms()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setNyError(e2.response?.data?.message || 'Failed to start new academic year')
    } finally {
      setStartingYear(false)
    }
  }

  const allSessions = [...new Set(terms.map((t) => t.session))].sort().reverse()
  const visibleTerms = terms.filter((tm) => tm.session === activeSession)
  const hasActiveTerm = terms.some((t) => t.isCurrent)
  const currentSession = terms.find((t) => t.isCurrent)?.session ?? null

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(visibleTerms, 15)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tt('Terms', 'Semesters')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {tt('Manage academic terms and sessions', 'Manage academic semesters and sessions')}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> {tt('Add Term', 'Add Semester')}
        </button>
      </div>

      {/* ── Academic Year Lifecycle Banner ─────────────────────────────── */}
      {hasActiveTerm ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookOpen size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Academic year <span className="font-bold">{currentSession}</span> is active
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                When school is done for the year, end the academic year to unlock promotions and compute PASS/REPEAT decisions.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowEndYear(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex-shrink-0"
          >
            End Academic Year <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PartyPopper size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                No active academic year
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Start a new academic year to activate a session and allow report cards, fees, and promotions.
              </p>
            </div>
          </div>
          <button
            onClick={openNewYear}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex-shrink-0"
          >
            <Plus size={14} /> Start New Year
          </button>
        </div>
      )}

      {/* ── Past sessions quick-reference ─────────────────────────────── */}
      {allSessions.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-muted-foreground">All sessions:</span>
          {allSessions.map((s) => (
            <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-medium ${s === currentSession ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
              {s} {s === currentSession && '· active'}
            </span>
          ))}
        </div>
      )}

      {/* ── Term cards ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : visibleTerms.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <Calendar size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {tt('No terms yet for this session.', 'No semesters yet for this session.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pageItems.map((term) => (
            <div key={term.id}
              className={`bg-card rounded-xl border p-5 ${term.isCurrent ? 'border-primary/40 ring-2 ring-primary/20 dark:border-primary ring-ring/20' : 'border-border'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{term.name}</h3>
                  <p className="text-sm text-muted-foreground">{term.session}</p>
                </div>
                {term.isCurrent && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{t('Current')}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mb-4 space-y-1">
                <p>{t('Start:')} {new Date(term.startDate).toLocaleDateString()}</p>
                <p>{t('End:')} {new Date(term.endDate).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                {!term.isCurrent && (
                  <button onClick={() => handleSetCurrent(term.id)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs border border-primary/30 text-primary py-1.5 rounded-lg hover:bg-primary/10 transition">
                    <CheckCircle size={12} /> {t('Set Current')}
                  </button>
                )}
                <button onClick={() => openEdit(term)}
                  className="flex items-center justify-center p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(term.id, term.name)}
                  className="flex items-center justify-center p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <div className="md:col-span-2 lg:col-span-3">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-border">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">
                {editingId ? tt('Edit Term', 'Edit Semester') : tt('Add Term', 'Add Semester')}
              </h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{tt('Term Name', 'Semester Name')}</label>
                <input type="text" placeholder={isUniversity ? 'First Semester' : 'First Term'}
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Session')}</label>
                <input type="text" placeholder="2025/2026"
                  value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}
                  required className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Start Date')}</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('End Date')}</label>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving...') : editingId ? t('Save Changes') : tt('Add Term', 'Add Semester')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── End Academic Year confirmation ────────────────────────────── */}
      {showEndYear && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" /> End Academic Year
              </h3>
              <button onClick={() => setShowEndYear(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              You are closing <strong className="text-foreground">{currentSession}</strong>. This will:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 pl-4 list-disc">
              <li>Unset the current {isUniversity ? 'semester' : 'term'} — no term will be active</li>
              {school?.repeatThreshold != null && (
                <li>Auto-compute PASS / REPEAT on all report cards (threshold: <strong className="text-foreground">{school.repeatThreshold}</strong>)</li>
              )}
              {school?.repeatThreshold == null && (
                <li className="text-amber-600 dark:text-amber-400">No pass threshold set — decisions won't be auto-computed (configure in Settings)</li>
              )}
              <li>Unlock the <strong className="text-foreground">Promote to Level 2</strong> action for university students</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-5">You can still view and edit report cards after closing. Individual {isUniversity ? 'semester' : 'term'} records stay intact.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowEndYear(false)}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                Cancel
              </button>
              <button type="button" onClick={handleEndYear} disabled={endingYear}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition">
                {endingYear ? 'Ending year...' : 'Yes, end the year'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Academic Year wizard ───────────────────────────────────── */}
      {showNewYear && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col border border-transparent dark:border-border">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                <PartyPopper size={18} className="text-blue-500" /> Start New Academic Year
              </h3>
              <button onClick={() => setShowNewYear(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {nyError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{nyError}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Session Name <span className="text-destructive">*</span></label>
                <input type="text" placeholder="2025/2026"
                  value={nySession} onChange={(e) => setNySession(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                <p className="text-xs text-muted-foreground mt-1">Use the format YYYY/YYYY (e.g. 2025/2026)</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">
                    {tt('Terms', 'Semesters')} <span className="text-destructive">*</span>
                  </label>
                  <div className="flex gap-1">
                    <button type="button"
                      onClick={() => setNyTerms((prev) => prev.slice(0, -1))}
                      disabled={nyTerms.length <= 1}
                      className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 transition">
                      – Remove
                    </button>
                    <button type="button"
                      onClick={() => setNyTerms((prev) => [...prev, { name: `${tt('Term', 'Semester')} ${prev.length + 1}`, startDate: '', endDate: '' }])}
                      disabled={nyTerms.length >= 4}
                      className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 transition">
                      + Add
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {nyTerms.map((td, i) => (
                    <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                      <input type="text" placeholder={`${tt('Term', 'Semester')} name`}
                        value={td.name}
                        onChange={(e) => setNyTerms((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Start</label>
                          <input type="date" value={td.startDate}
                            onChange={(e) => setNyTerms((prev) => prev.map((x, j) => j === i ? { ...x, startDate: e.target.value } : x))}
                            className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring mt-0.5" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">End</label>
                          <input type="date" value={td.endDate}
                            onChange={(e) => setNyTerms((prev) => prev.map((x, j) => j === i ? { ...x, endDate: e.target.value } : x))}
                            className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring mt-0.5" />
                        </div>
                      </div>
                      {i === 0 && (
                        <p className="text-xs text-primary">↑ This {tt('term', 'semester')} will be set as current automatically</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 pt-4 border-t border-border flex gap-3">
              <button type="button" onClick={() => setShowNewYear(false)}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                Cancel
              </button>
              <button type="button" onClick={handleStartYear} disabled={startingYear || !nySession.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition">
                {startingYear ? 'Starting...' : `Start ${nySession || 'new year'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
