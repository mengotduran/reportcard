'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getTermsApi, createTermApi, updateTermApi, setCurrentTermApi, deleteTermApi } from '@/lib/api/terms'
import { Calendar, Plus, Trash2, Pencil, X, CheckCircle } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface Term {
  id: string
  name: string
  session: string
  startDate: string
  endDate: string
  isCurrent: boolean
}

const emptyForm = { name: '', session: '', startDate: '', endDate: '' }

export default function TermsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const t = useT()
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)

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
    setForm(emptyForm)
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

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editingId) {
        await updateTermApi(editingId, form)
      } else {
        await createTermApi(form)
      }
      closeModal()
      fetchTerms()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Failed to save term'))
    } finally {
      setSaving(false)
    }
  }

  const handleSetCurrent = async (id: string) => {
    await setCurrentTermApi(id)
    fetchTerms()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${t('Delete term')} "${name}"?`)) return
    await deleteTermApi(id)
    fetchTerms()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Terms')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Manage academic terms and sessions')}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> {t('Add Term')}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : terms.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <Calendar size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t('No terms yet. Add your first term.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {terms.map((term) => (
            <div key={term.id}
              className={`bg-card rounded-xl border p-5 ${term.isCurrent ? 'border-primary/40 ring-2 ring-primary/20 dark:border-primary ring-ring/20' : 'border-border'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{term.name}</h3>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">{term.session}</p>
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
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-border">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{editingId ? t('Edit Term') : t('Add Term')}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-muted-foreground ">
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{t('Term Name')}</label>
                <input type="text" placeholder="First Term"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{t('Session')}</label>
                <input type="text" placeholder="2025/2026"
                  value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{t('Start Date')}</label>
                <input type="date"
                  value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{t('End Date')}</label>
                <input type="date"
                  value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving...') : editingId ? t('Save Changes') : t('Add Term')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
