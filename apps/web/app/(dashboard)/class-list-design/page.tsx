'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '@/lib/store/auth.store'
import { Save, Plus, Trash2, Printer } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import DesktopOnly from '@/components/ui/DesktopOnly'
import { useT } from '@/lib/i18n'
import {
  ClassListConfig, ClassListGroup, ClassListColumn,
  DEFAULT_CLASS_LIST_CONFIG, mergeClassListConfig, clCol, clGroup,
  getClassListTemplateApi, saveClassListTemplateApi,
} from '@/lib/api/classListTemplate'
import { ClassListDocOptions, classListPrintPortalHtml } from '@/lib/classListDocument'

const SAMPLE = [
  { name: 'Achu Brenda', studentId: '2025-0001' },
  { name: 'Bello Idris', studentId: '2025-0002' },
  { name: 'Che Vanessa', studentId: '2025-0003' },
]

// ── Click-to-edit text ────────────────────────────────────────────────────────
function Editable({ value, onChange, style, placeholder }: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties; placeholder?: string
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        size={Math.max(3, draft.length)}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(draft.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
        style={{ font: 'inherit', color: 'inherit', textAlign: 'inherit', background: 'rgba(240,62,47,0.08)', border: '1px solid #F03E2F', borderRadius: 3, padding: '0 3px', outline: 'none', ...style }}
      />
    )
  }
  return (
    <span onClick={() => setEditing(true)} title={t('Click to edit')}
      style={{ cursor: 'text', borderBottomWidth: 1, borderBottomStyle: 'dashed', borderBottomColor: 'rgba(0,0,0,0.28)', ...style }}>
      {value || <span style={{ color: '#aaa' }}>{placeholder || t('edit')}</span>}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between gap-3 py-1.5"><span className="text-sm text-foreground">{label}</span>{children}</label>
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-muted'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

export default function ClassListDesignPage() {
  const { school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const [config, setConfig] = useState<ClassListConfig>(DEFAULT_CLASS_LIST_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Test-print data — rendered into an off-screen in-page portal and printed
  // via window.print(), same as the report card (no popup window).
  const [printData, setPrintData] = useState<ClassListDocOptions[] | null>(null)

  useEffect(() => {
    getClassListTemplateApi()
      .then(res => setConfig(mergeClassListConfig(res.config, school?.type)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!printData) return
    const timer = setTimeout(() => { window.print(); setPrintData(null) }, 350)
    return () => clearTimeout(timer)
  }, [printData])

  const set = <K extends keyof ClassListConfig>(key: K, value: ClassListConfig[K]) => setConfig(c => ({ ...c, [key]: value }))
  const setGroups = (groups: ClassListGroup[]) => setConfig(c => ({ ...c, groups }))

  const updateGroup = (gi: number, patch: Partial<ClassListGroup>) =>
    setGroups(config.groups.map((g, i) => i === gi ? { ...g, ...patch } : g))
  const updateColumn = (gi: number, ci: number, patch: Partial<ClassListColumn>) =>
    setGroups(config.groups.map((g, i) => i !== gi ? g : { ...g, columns: g.columns.map((c, j) => j === ci ? { ...c, ...patch } : c) }))
  const addColumn = (gi: number) =>
    setGroups(config.groups.map((g, i) => i === gi ? { ...g, columns: [...g.columns, clCol('Col')] } : g))
  const removeColumn = (gi: number, ci: number) =>
    setGroups(config.groups.map((g, i) => i !== gi ? g : { ...g, columns: g.columns.filter((_, j) => j !== ci) }).filter(g => g.columns.length > 0))
  const addGroup = () => setGroups([...config.groups, clGroup('New Group', [clCol('Col 1'), clCol('Avg', true)])])
  const removeGroup = (gi: number) => setGroups(config.groups.filter((_, i) => i !== gi))

  const logoUrl = school?.logo ? (typeof window !== 'undefined' ? window.location.origin + school.logo : school.logo) : null

  const handleSave = async () => {
    setSaving(true)
    try { await saveClassListTemplateApi(config); showToast(t('Class list design saved')) }
    catch { showToast(t('Failed to save design'), 'error') }
    finally { setSaving(false) }
  }

  const inputCls = 'border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
  const c = config

  // canvas cell styles
  const thBase: React.CSSProperties = { border: '1px solid #333', padding: '4px 4px', textAlign: 'center', fontWeight: 700, fontSize: 11 }
  const tdBase: React.CSSProperties = { border: '1px solid #999', height: 22, fontSize: 11, textAlign: 'center' }

  return (
    <DesktopOnly message={t('The Class List Designer needs the space and precision of a bigger display. Please use a laptop or desktop computer.')}>
      <div>
        {/* Toolbar */}
        <div className="sticky top-0 z-20 bg-card border-b border-border -mx-8 -mt-8 px-8 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-foreground">{t('Class List Design')}</h2>
            <p className="text-xs text-muted-foreground">{t('Click any title, heading or column to edit it')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPrintData([{ students: SAMPLE, classLevel: 'Form 1', schoolName: school?.name ?? 'School', schoolType: school?.type ?? '', logoUrl, config }])}
              className="flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors">
              <Printer size={14} /> {t('Test print')}
            </button>
            <button onClick={handleSave} disabled={saving || loading}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition-colors">
              <Save size={15} /> {saving ? t('Saving…') : t('Save Design')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">{t('Loading…')}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
            {/* ── Options ── */}
            <div className="space-y-4">
              <SectionCard title={t('Header')}>
                <Field label={t('Show school logo')}><Toggle checked={c.showLogo} onChange={v => set('showLogo', v)} /></Field>
                <Field label={t('Show school type')}><Toggle checked={c.showSchoolType} onChange={v => set('showSchoolType', v)} /></Field>
                <Field label={t('Heading / title color')}><input type="color" value={c.headerColor} onChange={e => set('headerColor', e.target.value)} className="w-8 h-8 rounded border border-border" /></Field>
                <Field label={t('Average column color')}><input type="color" value={c.accentColor} onChange={e => set('accentColor', e.target.value)} className="w-8 h-8 rounded border border-border" /></Field>
              </SectionCard>
              <SectionCard title={t('Columns & rows')}>
                <Field label={t('Student ID column')}><Toggle checked={c.showId} onChange={v => set('showId', v)} /></Field>
                <Field label={t('Orientation')}>
                  <select className={inputCls} value={c.orientation} onChange={e => set('orientation', e.target.value as 'landscape' | 'portrait')}>
                    <option value="landscape">{t('Landscape')}</option>
                    <option value="portrait">{t('Portrait')}</option>
                  </select>
                </Field>
                <Field label={t('Blank rows')}><input type="number" min={0} max={30} className={`${inputCls} w-20`} value={c.blankRows} onChange={e => set('blankRows', Math.max(0, Math.min(30, Number(e.target.value) || 0)))} /></Field>
              </SectionCard>
              <SectionCard title={t('Meta row')}>
                <Field label={t('Subject field')}><Toggle checked={c.showMeta.subject} onChange={v => set('showMeta', { ...c.showMeta, subject: v })} /></Field>
                <Field label={t('Teacher field')}><Toggle checked={c.showMeta.teacher} onChange={v => set('showMeta', { ...c.showMeta, teacher: v })} /></Field>
                <Field label={t('Academic year field')}><Toggle checked={c.showMeta.year} onChange={v => set('showMeta', { ...c.showMeta, year: v })} /></Field>
              </SectionCard>
              <SectionCard title={t('Footer signatures')}>
                <div className="space-y-2 pt-1">
                  {c.footerFields.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className={`${inputCls} flex-1`} value={f} onChange={e => set('footerFields', c.footerFields.map((x, j) => j === i ? e.target.value : x))} />
                      <button onClick={() => set('footerFields', c.footerFields.filter((_, j) => j !== i))} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {c.footerFields.length < 6 && (
                    <button onClick={() => set('footerFields', [...c.footerFields, t('New Field')])} className="flex items-center gap-1 text-sm text-primary font-medium mt-1"><Plus size={14} /> {t('Add field')}</button>
                  )}
                </div>
              </SectionCard>
            </div>

            {/* ── Canvas — sticks in view while the (often taller) options
                panel on the left scrolls past it ── */}
            <div className="overflow-x-auto sticky top-24">
              <div className="bg-white text-black rounded-xl border border-border shadow-sm p-6 min-w-[640px]" style={{ fontFamily: 'Arial, sans-serif' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', borderBottom: '3px double #111', paddingBottom: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    {c.showLogo && logoUrl && <img src={logoUrl} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{school?.name ?? t('Your School')}</div>
                      {c.showSchoolType && <div style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: 2 }}>{school?.type} {t('School')}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                    <Editable value={c.subtitle} onChange={v => set('subtitle', v)} placeholder={t('add subtitle (optional)')} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, border: `2px solid ${c.headerColor}`, color: c.headerColor, display: 'inline-block', padding: '3px 18px' }}>
                      <Editable value={c.title} onChange={v => set('title', v)} /> — Form 1
                    </span>
                  </div>
                </div>

                {/* Table */}
                <div className="flex items-start gap-2">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ ...thBase, width: 26, background: '#f5f5f5' }}>#</th>
                        {c.showId && <th rowSpan={2} style={{ ...thBase, background: '#f5f5f5' }}>{t('ID')}</th>}
                        <th rowSpan={2} style={{ ...thBase, background: '#f5f5f5', textAlign: 'left', paddingLeft: 6 }}>{t('Student Name')}</th>
                        {c.groups.map((g, gi) => (
                          <th key={g.id} colSpan={g.columns.length} style={{ ...thBase, background: c.headerColor, color: '#fff', position: 'relative' }}>
                            <Editable value={g.label} onChange={v => updateGroup(gi, { label: v })} style={{ color: '#fff', borderBottomColor: 'rgba(255,255,255,0.5)' }} />
                            <button onClick={() => removeGroup(gi)} title={t('Remove group')}
                              style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', borderRadius: 999, width: 16, height: 16, fontSize: 10, lineHeight: '16px', cursor: 'pointer' }}>×</button>
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {c.groups.map((g, gi) => g.columns.map((col, ci) => (
                          <th key={col.id} style={{ ...thBase, background: col.avg ? c.accentColor : '#ddd', color: col.avg ? '#fff' : '#111', fontSize: 10, position: 'relative', whiteSpace: 'nowrap' }}>
                            <Editable value={col.label} onChange={v => updateColumn(gi, ci, { label: v })} style={col.avg ? { color: '#fff', borderBottomColor: 'rgba(255,255,255,0.5)' } : undefined} />
                            <span onClick={() => updateColumn(gi, ci, { avg: !col.avg })} title={t('Toggle average column')}
                              style={{ marginLeft: 4, cursor: 'pointer', fontSize: 9, opacity: 0.8 }}>{col.avg ? '★' : '☆'}</span>
                            {g.columns.length > 1 && (
                              <button onClick={() => removeColumn(gi, ci)} title={t('Remove column')}
                                style={{ position: 'absolute', top: -7, right: -6, background: '#ef4444', color: '#fff', borderRadius: 999, width: 14, height: 14, fontSize: 9, lineHeight: '14px', cursor: 'pointer' }}>×</button>
                            )}
                          </th>
                        )).concat(
                          <th key={`add-${g.id}`} style={{ ...thBase, background: '#fafafa', width: 22, cursor: 'pointer', color: '#16a34a' }} onClick={() => addColumn(gi)} title={t('Add column')}>+</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SAMPLE.map((s, i) => (
                        <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                          <td style={{ ...tdBase, color: '#555' }}>{i + 1}</td>
                          {c.showId && <td style={{ ...tdBase, color: '#666', fontSize: 10 }}>{s.studentId}</td>}
                          <td style={{ ...tdBase, textAlign: 'left', paddingLeft: 6 }}>{s.name}</td>
                          {c.groups.map(g => g.columns.map(col => (
                            <td key={col.id} style={{ ...tdBase, background: col.avg ? `${c.accentColor}14` : undefined }} />
                          )).concat(<td key={`pad-${g.id}`} style={tdBase} />))}
                        </tr>
                      ))}
                      <tr><td colSpan={2 + (c.showId ? 1 : 0)} style={{ ...tdBase, color: '#bbb', textAlign: 'left', paddingLeft: 6 }}>+ {c.blankRows} {t('blank rows')}</td>
                        {c.groups.map(g => g.columns.map(col => <td key={col.id} style={tdBase} />).concat(<td key={`bp-${g.id}`} style={tdBase} />))}</tr>
                    </tbody>
                  </table>
                  <button onClick={addGroup} title={t('Add column group')}
                    className="flex-shrink-0 mt-7 flex items-center gap-1 text-xs font-semibold text-green-600 border border-green-200 rounded-lg px-2 py-1 hover:bg-green-50">
                    <Plus size={13} /> {t('Group')}
                  </button>
                </div>

                {/* Footer preview */}
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #ccc', paddingTop: 14, fontSize: 11 }}>
                  {c.footerFields.map((f, i) => (
                    <div key={i} style={{ flex: i >= 2 ? 0.6 : 1 }}>
                      <div style={{ color: '#444', marginBottom: 4 }}>{f}</div>
                      <div style={{ borderBottom: '1px solid #111', height: 18 }} />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t('Click a title/heading/column to rename · ☆ toggles an average column · × removes · “+ Group” adds a term/semester. Mark cells print blank.')}</p>
            </div>
          </div>
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

        {printData && typeof document !== 'undefined' && createPortal(
          <div className="classlist-print-portal" dangerouslySetInnerHTML={{ __html: classListPrintPortalHtml(printData) }} />,
          document.body,
        )}
      </div>
    </DesktopOnly>
  )
}
