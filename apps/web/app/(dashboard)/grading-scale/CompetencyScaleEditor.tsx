'use client'
import { useEffect, useState } from 'react'
import { CompetencyLevel, DEFAULT_COMPETENCY_LEVELS, levelLabel, ratingChipColors } from '@/lib/competency'
import { getCompetencyScaleApi, saveCompetencyScaleApi } from '@/lib/api/competencyScale'
import { Save, Plus, Trash2, ChevronUp, ChevronDown, Lock } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

/**
 * The rating levels a nursery / pre-primary class is assessed on.
 *
 * Sits under the numeric grading scale rather than on its own page, because a primary school
 * runs both at once — Class 1-6 on marks, the nursery classes on ratings — and an admin
 * looking for "how is my school graded" should find both in one place.
 *
 * Only rendered when the school actually has a COMPETENCY class; a secondary school or a
 * primary school with no nursery would just be reading about a mode it does not use.
 */
export default function CompetencyScaleEditor({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const t = useT()
  const { school } = useAuthStore()
  const lang: 'EN' | 'FR' = school?.language === 'FR' ? 'FR' : 'EN'

  const [levels, setLevels] = useState<CompetencyLevel[]>(DEFAULT_COMPETENCY_LEVELS)
  const [isDefault, setIsDefault] = useState(true)
  const [frozenBy, setFrozenBy] = useState<{ className: string; termName: string } | null>(null)
  const [limits, setLimits] = useState({ min: 2, max: 6 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCompetencyScaleApi().then((s) => {
      setLevels(s.levels); setIsDefault(s.isDefault); setFrozenBy(s.frozenBy); setLimits(s.limits)
    }).finally(() => setLoading(false))
  }, [])

  const locked = frozenBy !== null

  const patch = (i: number, field: keyof CompetencyLevel, value: string) =>
    setLevels((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const move = (i: number, dir: -1 | 1) =>
    setLevels((ls) => {
      const j = i + dir
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const addLevel = () =>
    setLevels((ls) => ls.length >= limits.max ? ls : [
      ...ls,
      { id: `lvl_${Date.now()}`, labelEn: '', labelFr: '', short: '', color: '#475569' },
    ])

  const removeLevel = (i: number) =>
    setLevels((ls) => ls.length <= limits.min ? ls : ls.filter((_, idx) => idx !== i))

  const save = async () => {
    // Mirrors the server's rules so the admin is told before a round trip, not after.
    const blank = levels.find((l) => l.labelEn.trim() === '')
    if (blank) { onToast(t('Every level needs an English name.'), 'error'); return }
    const seen = new Set<string>()
    for (const l of levels) {
      const key = l.labelEn.trim().toLowerCase()
      if (seen.has(key)) { onToast(`"${l.labelEn}" ${t('is listed twice.')}`, 'error'); return }
      seen.add(key)
    }
    setSaving(true)
    try {
      const saved = await saveCompetencyScaleApi(levels)
      setLevels(saved.levels); setIsDefault(saved.isDefault)
      onToast(t('Rating levels saved'))
    } catch (err: any) {
      onToast(err?.response?.data?.message || t('Could not save the rating levels'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const saved = await saveCompetencyScaleApi(DEFAULT_COMPETENCY_LEVELS, true)
      setLevels(saved.levels); setIsDefault(true)
      onToast(t('Back to the standard rating levels'))
    } catch (err: any) {
      onToast(err?.response?.data?.message || t('Could not reset the rating levels'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="mt-10 border-t border-border pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground tracking-tight">{t('Nursery Rating Levels')}</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {t('How nursery and pre-primary classes are assessed. These classes carry a rating per subject instead of a mark, so their report cards show no total, no average and no position.')}
          </p>
          {isDefault && (
            <p className="text-xs text-muted-foreground mt-1">{t('Currently using the standard levels.')}</p>
          )}
        </div>
        {!locked && (
          <div className="flex gap-2 flex-shrink-0">
            {!isDefault && (
              <button onClick={reset} disabled={saving}
                className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-hover transition-colors disabled:opacity-50">
                {t('Reset to default')}
              </button>
            )}
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d63429] disabled:opacity-50 transition-colors">
              <Save size={13} />
              {saving ? t('Saving…') : t('Save Levels')}
            </button>
          </div>
        )}
      </div>

      {/* Frozen: cards are already in parents' hands stating these words. */}
      {locked && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <Lock size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-600">
            {t('Report cards for')} <strong>{frozenBy!.className}</strong> {t('have already been published for')} <strong>{frozenBy!.termName}</strong>
            {t(', so these levels are settled until the next academic year. Changing them now would leave the rest of the year using different words from the cards already sent home.')}
          </p>
        </div>
      )}

      {/* Preview: what a teacher will actually tap, in the order they will see it. */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">{t('Preview:')}</span>
        {levels.map((l) => {
          const c = ratingChipColors(l)
          return (
            <span key={l.id} className="text-xs font-semibold px-2.5 py-1 rounded-lg border"
              style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
              {levelLabel(l, lang, t) || t('(unnamed)')}
            </span>
          )
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase w-20">{t('Order')}</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase">{t('Name (English)')}</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase">{t('Name (French)')}</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase w-24">{t('Short')}</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase w-20">{t('Colour')}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {levels.map((l, i) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(i, -1)} disabled={locked || i === 0}
                        className="p-1 rounded hover:bg-hover disabled:opacity-30" title={t('Move up')}>
                        <ChevronUp size={13} />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={locked || i === levels.length - 1}
                        className="p-1 rounded hover:bg-hover disabled:opacity-30" title={t('Move down')}>
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input value={l.labelEn} onChange={(e) => patch(i, 'labelEn', e.target.value)} disabled={locked}
                      placeholder={t('e.g. Attained')}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground disabled:opacity-60" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={l.labelFr} onChange={(e) => patch(i, 'labelFr', e.target.value)} disabled={locked}
                      placeholder={t('e.g. Acquis')}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground disabled:opacity-60" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={l.short} onChange={(e) => patch(i, 'short', e.target.value)} disabled={locked}
                      maxLength={4} placeholder="A"
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground disabled:opacity-60" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="color" value={l.color} onChange={(e) => patch(i, 'color', e.target.value)} disabled={locked}
                      className="w-10 h-8 rounded border border-border bg-background disabled:opacity-60" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLevel(i)} disabled={locked || levels.length <= limits.min}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 transition"
                      title={levels.length <= limits.min ? t('A scale needs at least two levels') : t('Remove')}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && (
          <div className="px-3 py-2.5 border-t border-border">
            <button onClick={addLevel} disabled={levels.length >= limits.max}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 disabled:opacity-40 transition">
              <Plus size={13} />
              {levels.length >= limits.max ? `${t('Up to')} ${limits.max} ${t('levels')}` : t('Add level')}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        {t('Highest first. The English name is what gets stored on a report card, so renaming a level later does not change cards already issued. They keep the wording they were printed with.')}
      </p>
    </div>
  )
}
