'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getPromotionScaleApi, savePromotionScaleApi } from '@/lib/api/promotionScale'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { Save, Info, ArrowRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

const CARD = 'bg-card rounded-xl border border-border p-6'
const FIELD = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50'

export default function PromotionScalePage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [truePassMark, setTruePassMark] = useState(isUniversity ? 2.0 : 10)
  const [trialMinimum, setTrialMinimum] = useState('')
  const [passLabel, setPassLabel] = useState('Pass')
  const [trialLabel, setTrialLabel] = useState('This student was promoted on trial')
  const [repeatLabel, setRepeatLabel] = useState('Repeat')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getPromotionScaleApi().then((s) => {
      setTruePassMark(s.truePassMark)
      setTrialMinimum(s.trialMinimum != null ? String(s.trialMinimum) : '')
      setPassLabel(s.passLabel)
      setTrialLabel(s.trialLabel)
      setRepeatLabel(s.repeatLabel)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [isAuthenticated])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const parsed = trialMinimum === '' ? null : Number(trialMinimum)
      const res = await savePromotionScaleApi({
        trialMinimum: parsed,
        passLabel: passLabel.trim() || 'Pass',
        trialLabel: trialLabel.trim() || 'This student was promoted on trial',
        repeatLabel: repeatLabel.trim() || 'Repeat',
      })
      setPassLabel(res.passLabel)
      setTrialLabel(res.trialLabel)
      setRepeatLabel(res.repeatLabel)
      setTrialMinimum(res.trialMinimum != null ? String(res.trialMinimum) : '')
      showToast(t('Promotion scale saved'))
    } catch (err: any) {
      setError(err?.response?.data?.message || t('Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto py-12 text-center text-muted-foreground text-sm">{t('Loading…')}</div>

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('Promotion Scale')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('What gets written on the End of Year decision, for every student')}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d63429] disabled:opacity-50 transition-colors flex-shrink-0">
          <Save size={13} />
          {saving ? t('Saving…') : t('Save')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>
      )}

      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
        <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-400">
          {isUniversity
            ? t('The real pass mark below is not editable here — it comes from the Pass band on your Grading Scale.')
            : t('The real pass mark is fixed at 10/20 and cannot be lowered — it is the same for every school.')}
        </p>
      </div>

      <div className={`${CARD} space-y-5`}>
        {/* Pass — fixed real pass mark, editable wording only */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t('Pass')} ({isUniversity ? t('CGPA') : t('average')} {'≥'} {truePassMark})
            </label>
            <input type="text" value={passLabel} onChange={(e) => setPassLabel(e.target.value)} className={FIELD} placeholder="Pass" />
          </div>
          {isUniversity && (
            <button onClick={() => router.push('/grading-scale')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-6 flex-shrink-0">
              {t('Edit in Grading Scale')} <ArrowRight size={12} />
            </button>
          )}
        </div>

        {/* Promoted on Trial — the only band with an admin-editable boundary */}
        <div className="pb-5 border-b border-border">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {t('Promoted on Trial')} ({isUniversity ? t('CGPA') : t('average')} {t('from')}
            {' '}
            <input
              type="number" min={0} max={truePassMark} step={isUniversity ? 0.1 : 0.5}
              placeholder={isUniversity ? 'e.g. 1.5' : 'e.g. 7'}
              value={trialMinimum}
              onChange={(e) => setTrialMinimum(e.target.value)}
              className="inline-block w-20 border border-border rounded px-1.5 py-0.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {' '}{t('up to')} {truePassMark})
          </label>
          <input type="text" value={trialLabel} onChange={(e) => setTrialLabel(e.target.value)} className={`${FIELD} mt-2`} placeholder="This student was promoted on trial" />
          <p className="text-xs text-muted-foreground mt-1">
            {trialMinimum !== ''
              ? t('This still counts as a promotion — only the wording differs from Pass. Leave blank to disable this band entirely (straight Pass/Repeat at the real pass mark).')
              : t('Leave blank to disable this band — decisions will not be computed at all until a minimum is set.')}
          </p>
        </div>

        {/* Repeat — everything below the trial minimum (or below the real pass mark, if no
            trial minimum is set) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {t('Repeat')} ({t('below the minimum above')})
          </label>
          <input type="text" value={repeatLabel} onChange={(e) => setRepeatLabel(e.target.value)} className={FIELD} placeholder="Repeat" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        {t('This wording is shown on the admin’s End of Year report-cards list only, next to each student’s decision.')}
      </p>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
