'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getGradingScaleApi, saveGradingScaleApi, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { gradeFromPercent } from '@/lib/grading'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { Save, Plus, Trash2, Pencil, X, ChevronUp, ChevronDown } from 'lucide-react'

const emptyRange = (): GradeRange => ({
  id: `r_${Date.now()}`,
  minScore: 0, maxScore: 100,
  grade: '', remark: '', color: '#2563eb',
})

export default function GradingScalePage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const [ranges, setRanges] = useState<GradeRange[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<GradeRange>(emptyRange())
  const [testScore, setTestScore] = useState('')

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getGradingScaleApi().then(({ ranges: r }) => {
      setRanges(r.length > 0 ? r : DEFAULT_RANGES)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [isAuthenticated])

  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)

  const openEdit = (r: GradeRange) => { setEditForm({ ...r }); setEditingId(r.id) }
  const openAdd = () => { setEditForm(emptyRange()); setEditingId('__new__') }
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

  const move = (id: string, dir: 'up' | 'down') => {
    const idx = sorted.findIndex(r => r.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= sorted.length) return
    const newSorted = [...sorted]
    ;[newSorted[idx], newSorted[swap]] = [newSorted[swap], newSorted[idx]]
    setRanges(newSorted)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveGradingScaleApi(ranges)
      showToast('Grading scale saved')
    } catch {
      showToast('Failed to save', 'error')
    } finally { setSaving(false) }
  }

  const resetToDefault = () => {
    if (confirm('Reset to default grading scale? This will overwrite your current scale.')) {
      setRanges(DEFAULT_RANGES.map(r => ({ ...r, id: `r_${Date.now()}_${r.grade}` })))
    }
  }

  const testResult = testScore !== '' ? gradeFromPercent(Number(testScore), ranges) : null

  // Overlap / gap warnings
  const warnings: string[] = []
  const covered = new Array(101).fill(false)
  sorted.forEach(r => {
    for (let i = r.minScore; i <= Math.min(r.maxScore, 100); i++) {
      if (covered[i]) warnings.push(`Overlap detected around ${i}%`)
      covered[i] = true
    }
  })
  const gaps = covered.slice(0, 101).map((c, i) => !c ? i : null).filter(v => v !== null)
  if (gaps.length > 0 && gaps.length < 10) warnings.push(`Gaps at: ${gaps.join(', ')}%`)
  else if (gaps.length >= 10) warnings.push(`${gaps.length} percentage points not covered by any grade range`)
  const uniqueWarnings = [...new Set(warnings)].slice(0, 3)

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Grading Scale</h2>
          <p className="text-muted-foreground text-sm mt-1">Define grade ranges — grades are calculated automatically from these</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={resetToDefault} className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
            Reset to default
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d63429] disabled:opacity-50 transition-colors">
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Scale'}
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

      {/* Grade ranges table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
          <span className="text-sm font-semibold text-foreground">Grade Ranges</span>
          <button onClick={openAdd} className="flex items-center gap-1 text-sm text-green-500 hover:text-green-400 font-medium transition-colors">
            <Plus size={14} /> Add Range
          </button>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Grade</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Score Range (%)</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Remark</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Color</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Order</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Actions</th>
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
                  {r.minScore}% – {r.maxScore}%
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{r.remark || '—'}</td>
                <td className="px-4 py-3">
                  <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: r.color }} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => move(r.id, 'up')} disabled={i === 0}
                      className="p-1 text-muted-foreground hover:text-muted-foreground disabled:opacity-20">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => move(r.id, 'down')} disabled={i === sorted.length - 1}
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
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No ranges defined. Add one above.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {/* Live tester */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Test the Scale</h3>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input type="number" min="0" max="100" value={testScore}
              onChange={e => setTestScore(e.target.value)}
              placeholder="Enter a score (0–100%)"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
          {testResult && (
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold px-3 py-1 rounded-lg"
                style={{ color: testResult.color, backgroundColor: testResult.bgColor }}>
                {testResult.grade}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{testResult.remark}</p>
                <p className="text-xs text-muted-foreground">{testScore}%</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit / Add modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">
                {editingId === '__new__' ? 'Add Grade Range' : 'Edit Grade Range'}
              </h3>
              <button onClick={closeEdit} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Min Score (%)</label>
                  <input type="number" min="0" max="100" value={editForm.minScore}
                    onChange={e => setEditForm(f => ({ ...f, minScore: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Max Score (%)</label>
                  <input type="number" min="0" max="100" value={editForm.maxScore}
                    onChange={e => setEditForm(f => ({ ...f, maxScore: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Grade Letter</label>
                <input type="text" placeholder="e.g. A+, A, B, C, D, F" value={editForm.grade}
                  onChange={e => setEditForm(f => ({ ...f, grade: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Remark</label>
                <input type="text" placeholder="e.g. Excellent, Good, Fail" value={editForm.remark}
                  onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">Badge Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editForm.color}
                    onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <span className="text-sm font-mono text-muted-foreground"
                    style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: `${editForm.color}20`, color: editForm.color, fontWeight: 'bold' }}>
                    {editForm.grade || 'Preview'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={closeEdit}
                className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={!editForm.grade.trim()}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {editingId === '__new__' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
