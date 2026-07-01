'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getGradingScaleApi, saveGradingScaleApi,
  GradeRange, ClassificationBand, LegendRow,
  DEFAULT_RANGES, DEFAULT_UNIVERSITY_RANGES, DEFAULT_CLASSIFICATION_BANDS, DEFAULT_LEGEND_ROWS,
} from '@/lib/api/gradingScale'
import { gradeForScore20 } from '@/lib/grading'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { Save, Plus, Trash2, Pencil, X, ChevronUp, ChevronDown, Info } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function GradingScalePage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'
  const maxMark = isUniversity ? 100 : 20

  const emptyRange = (): GradeRange => ({
    id: `r_${Date.now()}`,
    minScore: 0, maxScore: maxMark,
    grade: '', remark: '', color: '#2563eb',
    ...(isUniversity ? { gradePoint: 0 } : {}),
  })

  const emptyBand = (): ClassificationBand => ({ min: 0, max: 0, label: '' })

  const [ranges, setRanges] = useState<GradeRange[]>([])
  const [classificationBands, setClassificationBands] = useState<ClassificationBand[]>([])
  const [legendRows, setLegendRows] = useState<LegendRow[]>(DEFAULT_LEGEND_ROWS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Grade range editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<GradeRange>(emptyRange())

  // Classification band editing
  const [editingBandIdx, setEditingBandIdx] = useState<number | null>(null)
  const [bandForm, setBandForm] = useState<ClassificationBand>(emptyBand())

  // Legend row editing
  const [editingLegendIdx, setEditingLegendIdx] = useState<number | null>(null)
  const [legendForm, setLegendForm] = useState<LegendRow>({ abbr: '', meaning: '' })

  const [testScore, setTestScore] = useState('')

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getGradingScaleApi().then(({ ranges: r, classificationBands: cb, legendRows: lr }) => {
      setRanges(r.length > 0 ? r : (isUniversity ? DEFAULT_UNIVERSITY_RANGES : DEFAULT_RANGES))
      setClassificationBands(
        isUniversity
          ? (cb.length > 0 ? cb : DEFAULT_CLASSIFICATION_BANDS)
          : []
      )
      if (lr.length > 0) setLegendRows(lr)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [isAuthenticated])

  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)
  const sortedBands = [...classificationBands].sort((a, b) => b.min - a.min)

  // ── Range editing ──
  const openEdit = (r: GradeRange) => { setEditForm({ ...r }); setEditingId(r.id) }
  const openAdd  = () => { setEditForm(emptyRange()); setEditingId('__new__') }
  const closeEdit = () => setEditingId(null)

  const saveEdit = () => {
    if (!editForm.grade.trim()) return
    if (editingId === '__new__') {
      setRanges(prev => [...prev, { ...editForm, id: `r_${Date.now()}` }])
    } else {
      setRanges(prev => prev.map(r => r.id === editingId ? editForm : r))
    }
    closeEdit()
  }

  const deleteRange = (id: string) => setRanges(prev => prev.filter(r => r.id !== id))

  const moveRange = (id: string, dir: 'up' | 'down') => {
    const idx = sorted.findIndex(r => r.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= sorted.length) return
    const s = [...sorted];
    [s[idx], s[swap]] = [s[swap], s[idx]]
    setRanges(s)
  }

  // ── Classification band editing ──
  const openBandEdit = (idx: number) => { setBandForm({ ...sortedBands[idx] }); setEditingBandIdx(idx) }
  const openBandAdd  = () => { setBandForm(emptyBand()); setEditingBandIdx(-1) }
  const closeBandEdit = () => setEditingBandIdx(null)

  const saveBandEdit = () => {
    if (!bandForm.label.trim()) return
    if (editingBandIdx === -1) {
      setClassificationBands(prev => [...prev, { ...bandForm }])
    } else {
      const updated = [...sortedBands]
      updated[editingBandIdx!] = { ...bandForm }
      setClassificationBands(updated)
    }
    closeBandEdit()
  }

  const deleteBand = (idx: number) => {
    const updated = [...sortedBands]
    updated.splice(idx, 1)
    setClassificationBands(updated)
  }

  // ── Save ──
  const handleSave = async () => {
    setSaving(true)
    try {
      await saveGradingScaleApi(ranges, isUniversity ? classificationBands : [], legendRows)
      showToast(t('Grading scale saved'))
    } catch {
      showToast(t('Failed to save'), 'error')
    } finally { setSaving(false) }
  }

  // ── Legend row editing ──
  const openLegendEdit = (idx: number) => { setLegendForm({ ...legendRows[idx] }); setEditingLegendIdx(idx) }
  const openLegendAdd  = () => { setLegendForm({ abbr: '', meaning: '' }); setEditingLegendIdx(-1) }
  const closeLegendEdit = () => setEditingLegendIdx(null)

  const saveLegendEdit = () => {
    if (!legendForm.abbr.trim()) return
    if (editingLegendIdx === -1) {
      setLegendRows(prev => [...prev, { ...legendForm }])
    } else {
      setLegendRows(prev => prev.map((r, i) => i === editingLegendIdx ? { ...legendForm } : r))
    }
    closeLegendEdit()
  }

  const deleteLegend = (idx: number) => setLegendRows(prev => prev.filter((_, i) => i !== idx))

  const resetToDefault = () => {
    if (confirm(t('Reset to default grading scale? This will overwrite your current scale.'))) {
      setRanges((isUniversity ? DEFAULT_UNIVERSITY_RANGES : DEFAULT_RANGES).map(r => ({ ...r, id: `r_${Date.now()}_${r.grade}` })))
      if (isUniversity) setClassificationBands(DEFAULT_CLASSIFICATION_BANDS)
    }
  }

  const testResult = testScore !== '' ? gradeForScore20(Number(testScore), ranges) : null

  // Coverage warning
  const step = isUniversity ? 1 : 0.5
  const warnings: string[] = []
  let uncovered = 0
  for (let s = 0; s <= maxMark; s += step) {
    if (!sorted.some(r => s >= r.minScore && s <= r.maxScore)) uncovered++
  }
  if (uncovered > 0) warnings.push(`${uncovered} ${t('marks')} (0–${maxMark}) ${t('are not covered by any grade range')}`)
  const uniqueWarnings = [...new Set(warnings)].slice(0, 3)

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('Grading Scale')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isUniversity
              ? t('University /100 grade ranges with Grade Points (GP) — used on annual transcripts')
              : t('Define grade ranges — grades are calculated automatically from these')}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={resetToDefault} className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
            {t('Reset to default')}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d63429] disabled:opacity-50 transition-colors">
            <Save size={13} />
            {saving ? t('Saving…') : t('Save Scale')}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {uniqueWarnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          {uniqueWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-500">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* University info banner */}
      {isUniversity && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
          <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            {t('University grading uses marks out of 100. Grade Points (/4.0) are used to compute GPA and CGPA on annual transcripts.')}
          </p>
        </div>
      )}

      {/* Grade ranges table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
          <span className="text-sm font-semibold text-foreground">{t('Grade Ranges')}</span>
          <button onClick={openAdd} className="flex items-center gap-1 text-sm text-green-500 hover:text-green-400 font-medium transition-colors">
            <Plus size={14} /> {t('Add Range')}
          </button>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Grade')}</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
                {isUniversity ? t('Mark Range (/100)') : t('Mark Range (/20)')}
              </th>
              {isUniversity && (
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Grade Point (GP)')}</th>
              )}
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Remark')}</th>
              {isUniversity && (
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Jury Decision')}</th>
              )}
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Color')}</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Order')}</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r, i) => (
              <tr key={r.id} className="hover:bg-muted dark:hover:bg-muted transition">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: `${r.color}20`, color: r.color }}>
                    {r.grade}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-foreground font-mono">
                  {r.minScore} – {r.maxScore} / {maxMark}
                </td>
                {isUniversity && (
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {r.gradePoint?.toFixed(2) ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-muted-foreground">{r.remark || '—'}</td>
                {isUniversity && (
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {(['VALIDATED', 'FAIL'] as const).map(opt => (
                        <button key={opt} type="button"
                          onClick={() => setRanges(prev => prev.map(x => x.id === r.id ? { ...x, juryDecision: opt } : x))}
                          className={`px-2 py-0.5 rounded text-xs font-semibold border transition-colors ${
                            r.juryDecision === opt
                              ? opt === 'FAIL'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-green-600 text-white border-green-600'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: r.color }} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveRange(r.id, 'up')} disabled={i === 0}
                      className="p-1 text-muted-foreground hover:text-muted-foreground disabled:opacity-20">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => moveRange(r.id, 'down')} disabled={i === sorted.length - 1}
                      className="p-1 text-muted-foreground hover:text-muted-foreground disabled:opacity-20">
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(r)}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteRange(r.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={isUniversity ? 8 : 6} className="text-center py-8 text-muted-foreground text-sm">{t('No ranges defined. Add one above.')}</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {/* University: CGPA Classification Bands (editable) */}
      {isUniversity && (
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
            <span className="text-sm font-semibold text-foreground">{t('CGPA Classification Bands')}</span>
            <button onClick={openBandAdd} className="flex items-center gap-1 text-sm text-green-500 hover:text-green-400 font-medium transition-colors">
              <Plus size={14} /> {t('Add Band')}
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('CGPA Range')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Classification')}</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedBands.map((b, i) => (
                <tr key={i} className="hover:bg-muted transition">
                  <td className="px-4 py-2 text-sm font-mono text-foreground">{b.min.toFixed(2)} – {b.max.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm font-semibold text-foreground">{b.label}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openBandEdit(i)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteBand(i)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedBands.length === 0 && (
                <tr><td colSpan={3} className="text-center py-6 text-muted-foreground text-sm">{t('No bands defined.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend entries — university only */}
      {isUniversity && <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
          <div>
            <span className="text-sm font-semibold text-foreground">{t('Legend Entries')}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{t('Abbreviation definitions shown in the grading legend on report cards')}</p>
          </div>
          <button onClick={openLegendAdd} className="flex items-center gap-1 text-sm text-green-500 hover:text-green-400 font-medium transition-colors">
            <Plus size={14} /> {t('Add Entry')}
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase w-24">{t('Abbreviation')}</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Meaning')}</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase w-20">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {legendRows.map((row, i) => (
              <tr key={i} className="hover:bg-muted transition">
                <td className="px-4 py-2 text-sm font-mono font-bold text-foreground">{row.abbr}</td>
                <td className="px-4 py-2 text-sm text-muted-foreground">{row.meaning}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openLegendEdit(i)}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteLegend(i)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {legendRows.length === 0 && (
              <tr><td colSpan={3} className="text-center py-6 text-muted-foreground text-sm">{t('No legend entries.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>}

      {/* Live tester */}
      {!isUniversity && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('Test the Scale')}</h3>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input type="number" min="0" max="20" step="0.5" value={testScore}
                onChange={e => setTestScore(e.target.value)}
                placeholder={t('Enter a mark (0–20)')}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/20</span>
            </div>
            {testResult && (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold px-3 py-1 rounded-lg"
                  style={{ color: testResult.color, backgroundColor: testResult.bgColor }}>
                  {testResult.grade}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{testResult.remark}</p>
                  <p className="text-xs text-muted-foreground">{testScore} / 20</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* University: live tester for /100 */}
      {isUniversity && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('Test the Scale')}</h3>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input type="number" min="0" max="100" step="1" value={testScore}
                onChange={e => setTestScore(e.target.value)}
                placeholder={t('Enter a mark (0–100)')}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/100</span>
            </div>
            {testScore !== '' && (() => {
              const score = Number(testScore)
              const s = [...ranges].sort((a, b) => b.minScore - a.minScore)
              const match = s.find(r => score >= r.minScore && score <= r.maxScore)
              if (!match) return <span className="text-xs text-amber-500">{t('No matching range')}</span>
              return (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold px-3 py-1 rounded-lg"
                    style={{ color: match.color, backgroundColor: `${match.color}20` }}>
                    {match.grade}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{match.remark}</p>
                    <p className="text-xs text-muted-foreground">GP: {match.gradePoint?.toFixed(2) ?? '—'} · {testScore} / 100</p>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Edit / Add grade range modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">
                {editingId === '__new__'
                  ? t('Add Grade Range')
                  : `${t('Edit Grade Range')}${editForm.grade ? ` — ${editForm.grade}` : ''}`}
              </h3>
              <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {isUniversity ? t('Min Mark (/100)') : t('Min Mark (/20)')}
                  </label>
                  <input type="number" min="0" max={maxMark} step={isUniversity ? 1 : 0.5} value={editForm.minScore}
                    onChange={e => setEditForm(f => ({ ...f, minScore: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {isUniversity ? t('Max Mark (/100)') : t('Max Mark (/20)')}
                  </label>
                  <input type="number" min="0" max={maxMark} step={isUniversity ? 1 : 0.5} value={editForm.maxScore}
                    onChange={e => setEditForm(f => ({ ...f, maxScore: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Grade Letter')}</label>
                <input type="text" placeholder="e.g. A+, A, B+, B, F" value={editForm.grade}
                  onChange={e => setEditForm(f => ({ ...f, grade: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Grade Point (0–4.00)')}</label>
                  <input type="number" min="0" max="4" step="0.01" value={editForm.gradePoint ?? 0}
                    onChange={e => setEditForm(f => ({ ...f, gradePoint: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Remark')}</label>
                <input type="text" placeholder="e.g. Excellent, Good, Fail" value={editForm.remark}
                  onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Jury Decision')}</label>
                  <div className="flex gap-2">
                    {(['VALIDATED', 'FAIL', ''] as const).map(opt => (
                      <button key={opt || 'none'} type="button"
                        onClick={() => setEditForm(f => ({ ...f, juryDecision: opt || undefined }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                          (editForm.juryDecision ?? '') === opt
                            ? opt === 'FAIL'
                              ? 'bg-red-600 text-white border-red-600'
                              : opt === ''
                                ? 'bg-muted border-border text-foreground'
                                : 'bg-green-600 text-white border-green-600'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}>
                        {opt || t('None')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Badge Color')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editForm.color}
                    onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <span className="text-sm font-mono"
                    style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: `${editForm.color}20`, color: editForm.color, fontWeight: 'bold' }}>
                    {editForm.grade || t('Preview')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={closeEdit}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                {t('Cancel')}
              </button>
              <button onClick={saveEdit} disabled={!editForm.grade.trim()}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {editingId === '__new__' ? t('Add') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add classification band modal */}
      {editingBandIdx !== null && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">
                {editingBandIdx === -1 ? t('Add Classification Band') : t('Edit Classification Band')}
              </h3>
              <button onClick={closeBandEdit} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Min CGPA')}</label>
                  <input type="number" min="0" max="4" step="0.01" value={bandForm.min}
                    onChange={e => setBandForm(f => ({ ...f, min: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Max CGPA')}</label>
                  <input type="number" min="0" max="4" step="0.01" value={bandForm.max}
                    onChange={e => setBandForm(f => ({ ...f, max: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Classification Label')}</label>
                <input type="text" placeholder="e.g. Distinction, Upper Credit, Pass" value={bandForm.label}
                  onChange={e => setBandForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={closeBandEdit}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                {t('Cancel')}
              </button>
              <button onClick={saveBandEdit} disabled={!bandForm.label.trim()}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {editingBandIdx === -1 ? t('Add') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add legend row modal */}
      {editingLegendIdx !== null && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">
                {editingLegendIdx === -1 ? t('Add Legend Entry') : t('Edit Legend Entry')}
              </h3>
              <button onClick={closeLegendEdit} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Abbreviation')}</label>
                <input type="text" placeholder="e.g. GP, CGPA, I, *" value={legendForm.abbr}
                  onChange={e => setLegendForm(f => ({ ...f, abbr: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Meaning')}</label>
                <input type="text" placeholder="e.g. Grade Point, Incomplete" value={legendForm.meaning}
                  onChange={e => setLegendForm(f => ({ ...f, meaning: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={closeLegendEdit}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                {t('Cancel')}
              </button>
              <button onClick={saveLegendEdit} disabled={!legendForm.abbr.trim()}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {editingLegendIdx === -1 ? t('Add') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
