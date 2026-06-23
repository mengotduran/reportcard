'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getTemplateApi, saveTemplateApi, getDefaultLayout, getDefaultLayoutForType,
  TemplateConfig, TemplateName, TEMPLATE_DEFAULTS,
  LayoutSection, InfoRow, SummaryBox, SignatureLine,
  HeaderSec, StudentInfoSec, MarksTableSec, SummarySec,
  RemarksSec, SignaturesSec, TextBlockSec, DividerSec,
} from '@/lib/api/reportCardTemplate'
import { useAuthStore as _useAuthStore } from '@/lib/store/auth.store'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { Save, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Monitor } from 'lucide-react'
import { useT } from '@/lib/i18n'

// ── Sample data for canvas preview ──────────────────────────────────────────
const SD = {
  school: { name: 'Your School Name', type: 'SECONDARY' },
  student: { name: 'Nguemo Alice', studentId: 'STU001', classLevel: 'Form 4 Science', guardianName: 'Nguemo Jean' },
  term: { name: 'First Term', session: '2025/2026' },
  subjects: ['Mathematics','Physics','Chemistry','English Language','History'],
  entries: [15,13,17,11,18],
  seq1: [14,12,16,10,17],
  seq2: [16,14,18,12,19],
  grades: ['B','C','A','D','A+'],
  remarks: ['Good','Satisfactory','Excellent','Needs improvement','Outstanding'],
  position: 3,
}
// Weighted-average preview: average = Σ(score × coeff) / Σ(coeff), out of 20.
// The sample subjects carry no coefficient, so each weighs 1.
const SD_TOTAL = SD.entries.reduce((a, b) => a + b, 0)        // Σ(score × coeff) = 74
const SD_AVG = SD.entries.length ? SD_TOTAL / SD.entries.length : 0  // 14.8 / 20

// Bilingual labels are authored "Français / English"; show only the school's language.
function localizeLabel(label: string, lang: 'EN' | 'FR'): string {
  if (typeof label !== 'string' || !label.includes(' / ')) return label
  const [fr, en] = label.split(' / ')
  return (lang === 'FR' ? fr : en).trim()
}
function localizeLayout<T extends { sections?: any[] }>(layout: T, lang: 'EN' | 'FR'): T {
  if (!layout?.sections) return layout
  const loc = (s: string) => localizeLabel(s, lang)
  return {
    ...layout,
    sections: layout.sections.map((s: any) => {
      if (s.type === 'student_info' && s.rows) return { ...s, rows: s.rows.map((r: any) => ({ ...r, label: loc(r.label) })) }
      if (s.type === 'summary' && s.boxes) return { ...s, boxes: s.boxes.map((b: any) => ({ ...b, label: loc(b.label) })) }
      if (s.type === 'remarks' && s.label) return { ...s, label: loc(s.label) }
      if (s.type === 'signatures' && s.lines) return { ...s, lines: s.lines.map((l: any) => ({ ...l, label: loc(l.label) })) }
      return s
    }),
  }
}

function resolveField(field: string, schoolName: string) {
  const map: Record<string, string> = {
    'student.name': SD.student.name,
    'student.studentId': SD.student.studentId,
    'student.classLevel': SD.student.classLevel,
    'student.guardianName': SD.student.guardianName,
    'term.name': SD.term.name,
    'term.session': SD.term.session,
    'school.name': schoolName,
  }
  return map[field] ?? field
}

function resolveSummary(field: string) {
  if (field === 'total')    return String(SD_TOTAL)
  if (field === 'average')  return SD_AVG.toFixed(1)
  if (field === 'position') return String(SD.position)
  if (field === 'grade')    return 'B'
  return '—'
}

// ── Color system ─────────────────────────────────────────────────────────────
// Module-level: toolbar calls this immediately when a color is picked, before blur
let activeColorCallback: ((color: string) => void) | null = null

const TEXT_COLORS = [
  '#000000','#374151','#6b7280','#ffffff',
  '#dc2626','#ea580c','#d97706','#16a34a','#2563eb','#7c3aed','#db2777',
]

// Extract CSS color from any HTML format (span style, font tag, rgb, hex)
function extractColor(html: string): string | null {
  let m = html.match(/style="[^"]*color:\s*([^;"]+)/i)
  if (m) return m[1].trim()
  m = html.match(/<font[^>]*\scolor=["']([^"']+)["']/i)
  if (m) return m[1].trim()
  return null
}
function plainText(html: string) { return html.replace(/<[^>]*>/g, '') }
function withColor(text: string, color: string | null | undefined) {
  const t = plainText(text)
  return color ? `<span style="color:${color}">${t}</span>` : t
}

function TextColorToolbar({ canvasRef }: { canvasRef: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const savedRange = useRef<Range | null>(null)

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setVisible(false); return }
      if (!canvasRef.current) return
      const range = sel.getRangeAt(0)
      if (!canvasRef.current.contains(range.commonAncestorContainer)) { setVisible(false); return }
      savedRange.current = range.cloneRange()
      const rect = range.getBoundingClientRect()
      setPos({ top: rect.top - 48, left: rect.left + rect.width / 2 })
      setVisible(true)
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [canvasRef])

  const applyColor = (color: string) => {
    // 1. Restore selection
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      try { sel.removeAllRanges(); sel.addRange(savedRange.current) } catch {}
    }
    // 2. Apply color
    document.execCommand('foreColor', false, color)
    // 3. Notify the active ET immediately (before blur) so siblings sync right away
    activeColorCallback?.(color)
    // 4. Blur the focused element to exit edit mode and save
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setVisible(false)
  }

  if (!visible) return null
  return (
    <div onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)',
        zIndex: 9999, background: '#1c1c1f', border: '1px solid #27272a', borderRadius: 8,
        padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: 10, color: '#71717a', fontWeight: 'bold', marginRight: 2 }}>A</span>
      {TEXT_COLORS.map(c => (
        <button key={c} title={c} onMouseDown={e => { e.preventDefault(); applyColor(c) }}
          style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0, flexShrink: 0, border: c === '#ffffff' ? '1px solid #555' : '1px solid rgba(255,255,255,0.12)' }}
        />
      ))}
    </div>
  )
}

// ── Inline-edit text (contentEditable, supports text color + immediate sync) ─
function ET({ value, onChange, onColorApplied, style, placeholder, multiline }: {
  value: string; onChange: (v: string) => void
  onColorApplied?: (color: string) => void
  style?: React.CSSProperties; placeholder?: string; multiline?: boolean
}) {
  const t = useT()
  const divRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)

  const startEdit = () => {
    // Register this field's color callback so toolbar can sync siblings immediately
    activeColorCallback = onColorApplied || null
    setEditing(true)
    setTimeout(() => {
      if (!divRef.current) return
      divRef.current.innerHTML = value || ''
      divRef.current.focus()
      const r = document.createRange(); const sel = window.getSelection()
      r.selectNodeContents(divRef.current); r.collapse(false)
      sel?.removeAllRanges(); sel?.addRange(r)
    }, 0)
  }

  const handleBlur = () => {
    activeColorCallback = null
    if (divRef.current) {
      const html = divRef.current.innerHTML.replace(/^<br>$/, '')
      onChange(html)
    }
    setEditing(false)
  }

  const base: React.CSSProperties = {
    minWidth: 40, outline: 'none',
    borderBottom: editing ? '2px solid #F03E2F' : '1px dashed rgba(148,163,184,0.5)',
    background: editing ? 'rgba(240,62,47,0.05)' : 'transparent',
    borderRadius: editing ? 3 : 0, padding: editing ? '1px 3px' : 0, cursor: 'text',
    ...style,
  }

  if (editing) {
    return <div ref={divRef} contentEditable suppressContentEditableWarning onBlur={handleBlur}
      onKeyDown={e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); divRef.current?.blur() } }}
      style={base} />
  }
  return (
    <span onClick={startEdit} title={t('Click to edit')} style={base}
      dangerouslySetInnerHTML={{ __html: value || `<span style="color:#94a3b8">${placeholder || t('Click to edit…')}</span>` }}
    />
  )
}

// Colorable sample-data cell: only saves column color, not text
function ColorableCell({ sampleText, color, onColorChange, style }: {
  sampleText: string; color?: string; onColorChange: (c: string) => void; style?: React.CSSProperties
}) {
  const t = useT()
  const ref = useRef<HTMLSpanElement>(null)
  const active = useRef(false)
  const getHtml = () => color ? `<span style="color:${color}">${sampleText}</span>` : sampleText

  useEffect(() => { if (ref.current && !active.current) ref.current.innerHTML = getHtml() })

  const handleFocus = () => {
    active.current = true
    activeColorCallback = (c) => { onColorChange(c) }
  }
  const handleBlur = () => {
    active.current = false
    activeColorCallback = null
    if (ref.current) {
      const c = extractColor(ref.current.innerHTML)
      if (c) onColorChange(c)
      ref.current.innerHTML = getHtml()
    }
  }

  return (
    <span ref={ref} contentEditable suppressContentEditableWarning
      title={t('Select text then pick a color to style this column')}
      onFocus={handleFocus} onBlur={handleBlur}
      style={{ outline: 'none', cursor: 'text', ...style }}
    />
  )
}

// ── Section wrapper (drag + up/down + delete) ─────────────────────────────────
function SectionWrap({ index, total, onMove, onDelete, onDragStart, onDragOver, onDrop, dragging, children }: {
  index: number; total: number; onMove: (d: 'up'|'down') => void
  onDelete: () => void; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void
  onDrop: () => void; dragging: boolean; children: React.ReactNode
}) {
  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      style={{ opacity: dragging ? 0.4 : 1, position: 'relative', marginBottom: 2 }}
      className="group"
    >
      {/* Section toolbar — visible on hover */}
      <div className="absolute -left-10 top-0 bottom-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: 36 }}>
        <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-muted-foreground p-0.5">
          <GripVertical size={14} />
        </div>
        <button onClick={() => onMove('up')} disabled={index === 0}
          className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 p-0.5">
          <ChevronUp size={12} />
        </button>
        <button onClick={() => onMove('down')} disabled={index === total - 1}
          className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 p-0.5">
          <ChevronDown size={12} />
        </button>
        <button onClick={onDelete}
          className="text-muted-foreground hover:text-destructive p-0.5">
          <Trash2 size={12} />
        </button>
      </div>
      {children}
    </div>
  )
}

// ── Section renderers (edit mode) ─────────────────────────────────────────────
function RenderHeader({ sec, color, schoolName, schoolType, schoolLogo, update }: { sec: HeaderSec; color: string; schoolName: string; schoolType: string; schoolLogo?: string | null; update: (s: HeaderSec) => void }) {
  const t = useT()
  const logoSize = sec.logoSize || 60

  const LogoEl = schoolLogo ? (
    <img src={schoolLogo} alt="logo" style={{ width: logoSize, height: logoSize, objectFit: 'contain', borderRadius: 4, display: 'block' }} />
  ) : (
    <div style={{ width: logoSize, height: logoSize, borderRadius: 4, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 'bold' }}>
      LOGO
    </div>
  )

  // Reusable colorable elements for school name & type
  const SchoolTypeEl = sec.showSchoolType ? (
    <p style={{ margin: '0 0 2px', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
      <ColorableCell sampleText={`${t(schoolType)} ${t('SCHOOL')}`} color={sec.schoolTypeColor || '#64748b'}
        onColorChange={c => update({ ...sec, schoolTypeColor: c })} />
    </p>
  ) : null

  const SchoolNameEl = (
    <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 2px' }}>
      <ColorableCell sampleText={schoolName} color={sec.schoolNameColor || color}
        onColorChange={c => update({ ...sec, schoolNameColor: c })} style={{ fontWeight: 'bold' }} />
    </h1>
  )

  const SubtitleEls = (
    <>
      <ET value={sec.subtitle} onChange={v => update({ ...sec, subtitle: v })}
        placeholder={t('Subtitle / address…')} style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }} />
      <ET value={sec.reportTitle} onChange={v => update({ ...sec, reportTitle: v })}
        style={{ display: 'block', fontSize: 14, fontWeight: 'bold', color, letterSpacing: 3, textTransform: 'uppercase' }} />
    </>
  )

  const textBlock = (
    <div style={{ flex: 1 }}>
      {SchoolTypeEl}
      {SchoolNameEl}
      {SubtitleEls}
    </div>
  )

  return (
    <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 14, marginBottom: 12 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, padding: '6px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#64748b', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={sec.showLogo} onChange={e => update({ ...sec, showLogo: e.target.checked })} />
          {t('Show Logo')}
        </label>
        {sec.showLogo && <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('Size:')}
            <input type="range" min={32} max={100} value={logoSize} onChange={e => update({ ...sec, logoSize: Number(e.target.value) })} style={{ width: 70 }} />
            {logoSize}px
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('Position:')}
            {(['left','center','right'] as const).map(p => (
              <button key={p} onClick={() => update({ ...sec, logoPosition: p })}
                style={{ padding: '1px 6px', fontSize: 10, borderRadius: 3, border: '1px solid', borderColor: sec.logoPosition === p ? color : '#d1d5db', background: sec.logoPosition === p ? color : 'white', color: sec.logoPosition === p ? 'white' : '#374151', cursor: 'pointer' }}>
                {t(p)}
              </button>
            ))}
          </label>
        </>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={sec.showSchoolType} onChange={e => update({ ...sec, showSchoolType: e.target.checked })} />
          {t('Show school type')}
        </label>
      </div>

      {/* Rendered header */}
      {sec.showLogo && sec.logoPosition === 'center' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{LogoEl}</div>
          {SchoolTypeEl}{SchoolNameEl}{SubtitleEls}
        </div>
      ) : sec.showLogo && sec.logoPosition === 'right' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{textBlock}{LogoEl}</div>
      ) : sec.showLogo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{LogoEl}{textBlock}</div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          {SchoolTypeEl}{SchoolNameEl}{SubtitleEls}
        </div>
      )}
    </div>
  )
}

function RenderStudentInfo({ sec, color, schoolName, update }: { sec: StudentInfoSec; color: string; schoolName: string; update: (s: StudentInfoSec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  const FIELD_OPTIONS = [
    { label: 'Student Name',  value: 'student.name' },
    { label: 'Student ID',    value: 'student.studentId' },
    { label: 'Class',         value: 'student.classLevel' },
    { label: 'Guardian',      value: 'student.guardianName' },
    { label: 'Term',          value: 'term.name' },
    { label: 'Session',       value: 'term.session' },
    { label: 'School',        value: 'school.name' },
  ]

  // Sync label color across all rows when one label is changed
  const syncLabelColor = (c: string) => {
    update({ ...sec, rows: sec.rows.map(r => ({ ...r, label: withColor(plainText(r.label), c) })) })
  }
  // Sync value color across all rows (same as how summary syncs valueColor)
  const syncValueColor = (c: string) => {
    update({ ...sec, rows: sec.rows.map(r => ({ ...r, valueColor: c })) })
  }
  const updateRow = (id: string, patch: Partial<InfoRow>) => {
    let rows = sec.rows.map(r => r.id === id ? { ...r, ...patch } : r)
    if (patch.label !== undefined) {
      const c = extractColor(patch.label)
      if (c) rows = rows.map(r => ({ ...r, label: withColor(plainText(r.label), c) }))
    }
    if (patch.valueColor !== undefined) {
      // Sync value color to all rows
      rows = rows.map(r => ({ ...r, valueColor: patch.valueColor }))
    }
    update({ ...sec, rows })
  }
  const deleteRow = (id: string) => update({ ...sec, rows: sec.rows.filter(r => r.id !== id) })
  const addRow = () => {
    const opt = FIELD_OPTIONS[0]
    const existingColor = sec.rows[0] ? extractColor(sec.rows[0].label) : undefined
    const label = existingColor ? withColor(opt.label, existingColor) : opt.label
    update({ ...sec, rows: [...sec.rows, { id: `r_${Date.now()}`, label, field: opt.value }] })
  }

  const currentValueColor = sec.rows[0]?.valueColor ?? '#374151'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{t('Columns:')}</span>
        {([1,2,3] as (1|2|3)[]).map(n => (
          <button key={n} onClick={() => update({ ...sec, columns: n })}
            style={{ padding: '1px 8px', fontSize: 11, borderRadius: 4, border: '1px solid', borderColor: sec.columns === n ? color : '#d1d5db', background: sec.columns === n ? color : 'white', color: sec.columns === n ? 'white' : '#374151' }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sec.columns}, 1fr)`, gap: '4px 12px', background: `rgba(${rgb},0.05)`, padding: 10, border: `1px solid rgba(${rgb},0.2)` }}>
        {sec.rows.map(row => {
          const existingLabelColor = extractColor(row.label)
          return (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            {/* Label — click to rename or recolor. Dropdown below auto-syncs its text. */}
            <ET value={row.label} onChange={v => updateRow(row.id, { label: v })}
              onColorApplied={c => syncLabelColor(c)}
              style={{ fontWeight: 'bold', width: 90, flexShrink: 0 }} />
            <span style={{ color: '#9ca3af' }}>:</span>
            {/* Colorable value — select text and pick color to style all values */}
            <ColorableCell
              sampleText={resolveField(row.field, schoolName)}
              color={row.valueColor ?? currentValueColor}
              onColorChange={c => syncValueColor(c)}
              style={{ flex: 1, minWidth: 0 }}
            />
            {/* Field picker — changing this also updates the label text automatically */}
            <select
              value={row.field}
              onChange={e => {
                const opt = FIELD_OPTIONS.find(o => o.value === e.target.value)
                const newLabel = opt
                  ? (existingLabelColor ? withColor(opt.label, existingLabelColor) : opt.label)
                  : row.label
                updateRow(row.id, { field: e.target.value, label: newLabel })
              }}
              style={{ fontSize: 10, border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 2px', color: '#9ca3af', flexShrink: 0 }}
              title={t('Choose which student data shows here — label updates automatically')}
            >
              {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
            </select>
            <button onClick={() => deleteRow(row.id)} style={{ color: '#f87171', cursor: 'pointer', background: 'none', border: 'none', padding: 2 }}>×</button>
          </div>
          )
        })}
      </div>
      <button onClick={addRow} style={{ marginTop: 6, fontSize: 11, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer' }}>
        {t('+ Add Row')}
      </button>
    </div>
  )
}

function RenderMarksTable({ sec, color, update }: { sec: MarksTableSec; color: string; update: (s: MarksTableSec) => void }) {
  const t = useT()
  const toggleCols = [
    { key: 'showSeq1' as const, label: 'Seq 1' },
    { key: 'showSeq2' as const, label: 'Seq 2' },
    { key: 'showGrade' as const, label: 'Grade' },
    { key: 'showRemarks' as const, label: 'Remarks' },
  ]

  const hdrs = sec.headers || {}
  const cc   = sec.colColors || {}
  const hColor = sec.headerColor  // shared color for ALL headers

  // All headers are ONE category — syncing one syncs all
  const syncHeaderColor = (c: string) =>
    update({ ...sec, headerColor: c })
  const setHeaderText = (col: string, val: string) => {
    const c = extractColor(val)
    update({ ...sec, headers: { ...hdrs, [col]: val }, ...(c ? { headerColor: c } : {}) })
  }
  const setColColor = (col: string, c: string) =>
    update({ ...sec, colColors: { ...cc, [col]: c } })

  const hStyle = (align: 'left'|'center', pad: string): React.CSSProperties => ({
    padding: pad, textAlign: align, color: hColor || '#fff', fontWeight: 'bold',
  })

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {toggleCols.map(c => (
          <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={sec[c.key]} onChange={e => update({ ...sec, [c.key]: e.target.checked })} />
            {t(c.label)}
          </label>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: color }}>
            <th style={hStyle('left', '6px 10px')}>
              <ET value={hdrs.subject ?? t('Subject')} onChange={v => setHeaderText('subject', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>
            {sec.showSeq1 && <th style={hStyle('center', '6px 8px')}>
              <ET value={hdrs.seq1 ?? t('Seq 1')} onChange={v => setHeaderText('seq1', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>}
            {sec.showSeq2 && <th style={hStyle('center', '6px 8px')}>
              <ET value={hdrs.seq2 ?? t('Seq 2')} onChange={v => setHeaderText('seq2', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>}
            <th style={hStyle('center', '6px 8px')}>
              <ET value={hdrs.score ?? t('Score')} onChange={v => setHeaderText('score', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>
            {sec.showGrade && <th style={hStyle('center', '6px 8px')}>
              <ET value={hdrs.grade ?? t('Grade')} onChange={v => setHeaderText('grade', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>}
            {sec.showRemarks && <th style={hStyle('left', '6px 10px')}>
              <ET value={hdrs.remarks ?? t('Remarks')} onChange={v => setHeaderText('remarks', v)}
                onColorApplied={syncHeaderColor} style={{ color: hColor || '#fff', fontWeight: 'bold' }} />
            </th>}
          </tr>
        </thead>
        <tbody>
          {SD.subjects.map((subj, i) => (
            <tr key={subj} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.025)', borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '5px 10px' }}>
                <ColorableCell sampleText={subj} color={cc.subject}
                  onColorChange={c => setColColor('subject', c)} />
              </td>
              {sec.showSeq1 && <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                <ColorableCell sampleText={String(SD.seq1[i])} color={cc.seq1}
                  onColorChange={c => setColColor('seq1', c)} />
              </td>}
              {sec.showSeq2 && <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                <ColorableCell sampleText={String(SD.seq2[i])} color={cc.seq2}
                  onColorChange={c => setColColor('seq2', c)} />
              </td>}
              <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                <ColorableCell sampleText={String(SD.entries[i])} color={cc.score || color}
                  onColorChange={c => setColColor('score', c)} />
              </td>
              {sec.showGrade && <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                <ColorableCell sampleText={SD.grades[i]} color={cc.grade}
                  onColorChange={c => setColColor('grade', c)} />
              </td>}
              {sec.showRemarks && <td style={{ padding: '5px 10px' }}>
                <ColorableCell sampleText={SD.remarks[i]} color={cc.remarks}
                  onColorChange={c => setColColor('remarks', c)} />
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RenderSummary({ sec, color, update }: { sec: SummarySec; color: string; update: (s: SummarySec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  const FIELD_OPTIONS = [
    { label: 'Total Score', value: 'total' },
    { label: 'Average',     value: 'average' },
    { label: 'Position',    value: 'position' },
    { label: 'Grade',       value: 'grade' },
  ]
  const syncBoxLabelColor = (c: string) =>
    update({ ...sec, boxes: sec.boxes.map(b => ({ ...b, label: withColor(plainText(b.label), c) })) })
  const syncBoxValueColor = (c: string) =>
    update({ ...sec, valueColor: c })
  const updateBox = (id: string, patch: Partial<SummaryBox>) => {
    let boxes = sec.boxes.map(b => b.id === id ? { ...b, ...patch } : b)
    if (patch.label !== undefined) {
      const c = extractColor(patch.label)
      if (c) boxes = boxes.map(b => ({ ...b, label: withColor(plainText(b.label), c) }))
    }
    update({ ...sec, boxes })
  }
  const deleteBox = (id: string) => update({ ...sec, boxes: sec.boxes.filter(b => b.id !== id) })
  const addBox = () => update({ ...sec, boxes: [...sec.boxes, { id: `b_${Date.now()}`, label: t('New Stat'), field: 'total' }] })

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sec.boxes.length || 1}, 1fr)`, gap: 10 }}>
        {sec.boxes.map(box => (
          <div key={box.id} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center', position: 'relative' }}>
            <button onClick={() => deleteBox(box.id)} style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            <div style={{ fontSize: 20, fontWeight: 'bold' }}>
              <ColorableCell sampleText={resolveSummary(box.field)} color={sec.valueColor || color}
                onColorChange={syncBoxValueColor} style={{ fontWeight: 'bold' }} />
            </div>
            <ET value={box.label} onChange={v => updateBox(box.id, { label: v })} onColorApplied={syncBoxLabelColor}
              style={{ fontSize: 11, color: '#6b7280', display: 'block', margin: '3px auto 4px' }} />
            <select value={box.field} onChange={e => updateBox(box.id, { field: e.target.value })}
              style={{ fontSize: 10, border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 2px' }}>
              {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button onClick={addBox} style={{ marginTop: 6, fontSize: 11, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer' }}>
        {t('+ Add Box')}
      </button>
    </div>
  )
}

function RenderRemarks({ sec, color, update }: { sec: RemarksSec; color: string; update: (s: RemarksSec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  return (
    <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 12, marginBottom: 12 }}>
      <ET value={sec.label} onChange={v => update({ ...sec, label: v })}
        style={{ fontWeight: 'bold', marginBottom: 5, color, display: 'block' }} />
      <div style={{ fontSize: 12, fontStyle: 'italic', minHeight: 32, borderBottom: '1px dashed #e5e7eb', padding: '4px 0' }}>
        <ColorableCell sampleText={t('Student remarks will appear here…')}
          color={sec.placeholderColor || '#9ca3af'}
          onColorChange={c => update({ ...sec, placeholderColor: c })} />
      </div>
    </div>
  )
}

function RenderSignatures({ sec, color, update }: { sec: SignaturesSec; color: string; update: (s: SignaturesSec) => void }) {
  const t = useT()
  const syncLineColor = (c: string) =>
    update({ ...sec, lines: sec.lines.map(l => ({ ...l, label: withColor(plainText(l.label), c) })) })
  const updateLine = (id: string, label: string) => {
    const c = extractColor(label)
    let lines = sec.lines.map(l => l.id === id ? { ...l, label } : l)
    if (c) lines = lines.map(l => ({ ...l, label: withColor(plainText(l.label), c) }))
    update({ ...sec, lines })
  }
  const deleteLine = (id: string) => update({ ...sec, lines: sec.lines.filter(l => l.id !== id) })
  const addLine = () => update({ ...sec, lines: [...sec.lines, { id: `s_${Date.now()}`, label: 'Signature' }] })

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sec.lines.length || 1}, 1fr)`, gap: 20, marginTop: 24 }}>
        {sec.lines.map(line => (
          <div key={line.id} style={{ textAlign: 'center', position: 'relative' }}>
            <button onClick={() => deleteLine(line.id)} style={{ position: 'absolute', top: -16, right: 0, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>×</button>
            <div style={{ borderBottom: '1px solid #111', height: 40, marginBottom: 5 }} />
            <ET value={line.label} onChange={v => updateLine(line.id, v)} onColorApplied={syncLineColor} style={{ fontSize: 11, color: '#555', display: 'block' }} />
          </div>
        ))}
      </div>
      <button onClick={addLine} style={{ marginTop: 10, fontSize: 11, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer' }}>
        {t('+ Add Signature Line')}
      </button>
    </div>
  )
}

function RenderTextBlock({ sec, color, update }: { sec: TextBlockSec; color: string; update: (s: TextBlockSec) => void }) {
  const t = useT()
  return (
    <div style={{ marginBottom: 8, textAlign: sec.align, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
        {(['left','center','right'] as const).map(a => (
          <button key={a} onClick={() => update({ ...sec, align: a })}
            style={{ padding: '1px 5px', fontSize: 10, border: '1px solid', borderColor: sec.align === a ? color : '#d1d5db', background: sec.align === a ? color : 'white', color: sec.align === a ? 'white' : '#374151', borderRadius: 3, cursor: 'pointer' }}>
            {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
          </button>
        ))}
      </div>
      <ET value={sec.content} onChange={v => update({ ...sec, content: v })} multiline
        placeholder={t('Type your text here…')} style={{ fontSize: 12, color: '#555', width: '100%', display: 'block' }} />
    </div>
  )
}

function RenderDivider({ sec, color, update }: { sec: DividerSec; color: string; update: (s: DividerSec) => void }) {
  const t = useT()
  return (
    <div style={{ padding: '8px 0', marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {(['solid','dashed'] as const).map(s => (
          <button key={s} onClick={() => update({ ...sec, style: s })}
            style={{ padding: '1px 8px', fontSize: 10, border: '1px solid', borderColor: sec.style === s ? color : '#d1d5db', background: sec.style === s ? color : 'white', color: sec.style === s ? 'white' : '#374151', borderRadius: 3, cursor: 'pointer' }}>
            {t(s)}
          </button>
        ))}
      </div>
      <hr style={{ border: 'none', borderTop: `2px ${sec.style} ${color}`, margin: 0 }} />
    </div>
  )
}

function hexRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1],16)}, ${parseInt(r[2],16)}, ${parseInt(r[3],16)}` : '30,58,95'
}

// ── Templates gallery ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'classic'  as TemplateName, label: 'Classic GCE',  color: '#1e3a5f' },
  { id: 'bilingual'as TemplateName, label: 'Bilingual',    color: '#1a5c1a' },
  { id: 'modern'   as TemplateName, label: 'Modern',       color: '#2563eb' },
  { id: 'official' as TemplateName, label: 'Official',     color: '#92400e' },
]

const ADD_OPTIONS = [
  { type: 'text_block' as const, label: '📝 Text Block' },
  { type: 'divider'    as const, label: '── Divider' },
  { type: 'remarks'    as const, label: '💬 Remarks' },
  { type: 'signatures' as const, label: '✍ Signatures' },
  { type: 'summary'    as const, label: '📊 Summary Boxes' },
  { type: 'student_info' as const, label: '👤 Student Info' },
  { type: 'marks_table'  as const, label: '📋 Marks Table' },
]

function newSection(type: LayoutSection['type'], color: string): LayoutSection {
  const id = `sec_${Date.now()}`
  if (type === 'text_block')   return { id, type, content: 'New text block', align: 'left' }
  if (type === 'divider')      return { id, type, style: 'solid' }
  if (type === 'remarks')      return { id, type, label: 'General Remarks' }
  if (type === 'signatures')   return { id, type, lines: [{ id: `s_${Date.now()}`, label: 'Signature' }] }
  if (type === 'summary')      return { id, type, boxes: [{ id: `b_${Date.now()}`, label: 'Total Score', field: 'total' }] }
  if (type === 'student_info') return { id, type, columns: 2, rows: [{ id: `r_${Date.now()}`, label: 'Student Name', field: 'student.name' }] }
  if (type === 'marks_table')  return { id, type, showSeq1: true, showSeq2: true, showGrade: true, showRemarks: true }
  return { id, type: 'header', reportTitle: 'REPORT CARD', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' as const }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportCardDesignPage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const tr = useT()
  const [config, setConfig] = useState<TemplateConfig & { sections: LayoutSection[] }>(getDefaultLayout('classic'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [colorText, setColorText] = useState(config.primaryColor)
  const [bgText, setBgText] = useState(config.bgColor || '#ffffff')
  const canvasRef = useRef<HTMLDivElement>(null)
  const schoolName = school?.name || 'Your School Name'
  const schoolType = school?.type || 'SECONDARY'
  const schoolLogo = school?.logo ?? null
  const watermark = config.watermark ?? { enabled: false, type: 'text' as const, text: '', color: '#000000', opacity: 8, logoUrl: null, size: 240, rotation: -45 }
  const setWatermark = (patch: Partial<typeof watermark>) =>
    setConfig(c => ({ ...c, watermark: { ...watermark, ...patch } }))
  const wmUploadRef = useRef<HTMLInputElement>(null)
  const handleWmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setWatermark({ logoUrl: ev.target?.result as string })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    // Labels follow the school's language (the model is one language per section,
    // never bilingual) — collapse any "Français / English" labels to that language.
    const lang: 'EN' | 'FR' = school?.language === 'FR' ? 'FR' : 'EN'
    getTemplateApi().then(({ config: saved }) => {
      if (saved && (saved as any).sections?.length > 0) {
        const base = getDefaultLayout((saved.template as TemplateName) || 'classic')
        const merged = localizeLayout({ ...base, ...saved } as any, lang)
        setConfig(merged)
        setColorText(merged.primaryColor)
        setBgText(merged.bgColor || '#ffffff')
      } else if (saved && Object.keys(saved).length > 0) {
        const tpl = (saved.template as TemplateName) || 'classic'
        const layout = getDefaultLayout(tpl)
        const merged = localizeLayout({ ...layout, ...saved, sections: layout.sections } as any, lang)
        setConfig(merged)
        setColorText(merged.primaryColor)
        setBgText(merged.bgColor || '#ffffff')
      } else {
        // No saved design yet → start from the section-type default
        const layout = localizeLayout(getDefaultLayoutForType(school?.type), lang)
        setConfig(layout)
        setColorText(layout.primaryColor)
        setBgText(layout.bgColor || '#ffffff')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [isAuthenticated])

  const sections = config.sections || []

  const updateSection = (index: number, sec: LayoutSection) =>
    setConfig(c => { const s = [...c.sections]; s[index] = sec; return { ...c, sections: s } })

  const deleteSection = (index: number) =>
    setConfig(c => ({ ...c, sections: c.sections.filter((_, i) => i !== index) }))

  const moveSection = (index: number, dir: 'up'|'down') => {
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= sections.length) return
    setConfig(c => {
      const s = [...c.sections]
      ;[s[index], s[swap]] = [s[swap], s[index]]
      return { ...c, sections: s }
    })
  }

  const addSection = (type: LayoutSection['type']) => {
    const sec = newSection(type, config.primaryColor)
    setConfig(c => ({ ...c, sections: [...c.sections, sec] }))
    setShowAddMenu(false)
  }

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return
    setConfig(c => {
      const s = [...c.sections]
      const [moved] = s.splice(dragIndex, 1)
      s.splice(targetIndex, 0, moved)
      return { ...c, sections: s }
    })
    setDragIndex(null)
  }

  const loadTemplate = (name: TemplateName) => {
    const layout = getDefaultLayout(name)
    setConfig(layout)
    setColorText(layout.primaryColor)
    setBgText(layout.bgColor || '#ffffff')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveTemplateApi(config as TemplateConfig)
      showToast(tr('Design saved successfully'))
    } catch {
      showToast(tr('Failed to save'), 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>

  return (
    <>
      {/* ── Mobile: designer needs a larger screen ── */}
      <div className="md:hidden flex flex-col items-center justify-center text-center min-h-[60vh] px-6">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <Monitor size={26} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{tr('Open this on a larger screen')}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          {tr('The Report Card Designer needs the space and precision of a bigger display. Please use a laptop or desktop computer to customize your report card layout.')}
        </p>
      </div>

      {/* ── Designer — desktop / tablet only ── */}
      <div className="hidden md:block">
      {/* ── Sticky toolbar ── */}
      <div className="sticky top-0 z-20 bg-card border-b border-border -mx-8 -mt-8 px-8 py-3 mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">{tr('Report Card Design')}</h2>
        </div>

        {/* Template picker */}
        <div className="flex gap-1 ml-2">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => loadTemplate(t.id)} title={tr(t.label)}
              className="px-3 py-1 rounded text-xs font-medium border transition"
              style={{ borderColor: config.template === t.id ? t.color : '#e5e7eb', background: config.template === t.id ? t.color : 'white', color: config.template === t.id ? 'white' : '#374151' }}>
              {tr(t.label)}
            </button>
          ))}
        </div>

        {/* Primary color */}
        <div className="flex items-center gap-2 ml-2">
          <label className="text-xs text-muted-foreground">{tr('Color')}</label>
          <input type="color" value={config.primaryColor}
            onChange={e => { setConfig(c => ({ ...c, primaryColor: e.target.value })); setColorText(e.target.value) }}
            className="w-7 h-7 rounded border border-border cursor-pointer" />
          <input type="text" value={colorText}
            onChange={e => {
              setColorText(e.target.value)
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                setConfig(c => ({ ...c, primaryColor: e.target.value }))
            }}
            className="w-20 border border-border rounded px-2 py-1 text-xs font-mono text-foreground" />
        </div>

        {/* Background color */}
        <div className="flex items-center gap-2 ml-2">
          <label className="text-xs text-muted-foreground">{tr('Background')}</label>
          <input type="color" value={config.bgColor || '#ffffff'}
            onChange={e => { setConfig(c => ({ ...c, bgColor: e.target.value })); setBgText(e.target.value) }}
            className="w-7 h-7 rounded border border-border cursor-pointer" />
          <input type="text" value={bgText}
            onChange={e => {
              setBgText(e.target.value)
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                setConfig(c => ({ ...c, bgColor: e.target.value }))
            }}
            className="w-20 border border-border rounded px-2 py-1 text-xs font-mono text-foreground" />
          {config.bgColor && config.bgColor !== '#ffffff' && (
            <button onClick={() => { setConfig(c => ({ ...c, bgColor: '#ffffff' })); setBgText('#ffffff') }}
              className="text-xs text-muted-foreground hover:text-muted-foreground underline">{tr('reset')}</button>
          )}
        </div>

        {/* Watermark */}
        <div className="flex items-center gap-2 ml-2 border-l border-border pl-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={watermark.enabled} onChange={e => setWatermark({ enabled: e.target.checked })} />
            {tr('Watermark')}
          </label>
          {watermark.enabled && (
            <>
              {/* Type toggle */}
              <div className="flex rounded border border-border overflow-hidden text-xs">
                <button
                  className={`px-2 py-1 transition ${(watermark.type ?? 'text') === 'text' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setWatermark({ type: 'text' })}>{tr('Text')}</button>
                <button
                  className={`px-2 py-1 transition ${(watermark.type ?? 'text') === 'logo' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setWatermark({ type: 'logo' })}>{tr('Logo')}</button>
              </div>

              {(watermark.type ?? 'text') === 'text' ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input type="text" value={watermark.text} onChange={e => setWatermark({ text: e.target.value })}
                    placeholder={schoolName}
                    className="border border-border rounded px-2 py-1 text-xs w-28" />
                  <input type="color" value={watermark.color} onChange={e => setWatermark({ color: e.target.value })}
                    className="w-7 h-7 rounded border border-border cursor-pointer" title={tr('Watermark color')} />

                  {/* Font size */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{tr('Size')}</span>
                    <input type="range" min={20} max={160} step={2} value={watermark.size ?? 80} onChange={e => setWatermark({ size: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.size ?? 80}px</span>
                  </div>

                  {/* Position X */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">X</span>
                    <input type="range" min={0} max={100} step={1} value={watermark.x ?? 50} onChange={e => setWatermark({ x: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.x ?? 50}%</span>
                  </div>

                  {/* Position Y */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Y</span>
                    <input type="range" min={0} max={100} step={1} value={watermark.y ?? 50} onChange={e => setWatermark({ y: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.y ?? 50}%</span>
                  </div>

                  {/* Rotation */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{tr('Tilt')}</span>
                    <input type="range" min={-180} max={180} step={1} value={watermark.rotation ?? -45} onChange={e => setWatermark({ rotation: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.rotation ?? -45}°</span>
                    <button onClick={() => setWatermark({ x: 50, y: 50, rotation: 0 })}
                      className="px-2 py-1 text-xs border border-border rounded text-muted-foreground hover:bg-muted transition">
                      {tr('Center')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Preview thumbnail */}
                  {(watermark.logoUrl || schoolLogo)
                    ? <img src={watermark.logoUrl || schoolLogo!} alt="wm" className="w-7 h-7 object-contain rounded border border-border" />
                    : <span className="text-xs text-muted-foreground italic">{tr('No logo')}</span>}

                  {/* Upload button */}
                  <input ref={wmUploadRef} type="file" accept="image/*" className="hidden" onChange={handleWmUpload} />
                  <button onClick={() => wmUploadRef.current?.click()}
                    className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition">
                    {tr('Upload image')}
                  </button>

                  {/* Revert to school logo */}
                  {watermark.logoUrl && (
                    <button onClick={() => setWatermark({ logoUrl: null })}
                      className="px-2 py-1 text-xs border border-border rounded text-muted-foreground hover:bg-muted transition">
                      {tr('Use school logo')}
                    </button>
                  )}

                  {/* Size */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{tr('Size')}</span>
                    <input type="range" min={60} max={480} step={10} value={watermark.size ?? 240} onChange={e => setWatermark({ size: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.size ?? 240}px</span>
                  </div>

                  {/* Position X */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">X</span>
                    <input type="range" min={0} max={100} step={1} value={watermark.x ?? 50} onChange={e => setWatermark({ x: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.x ?? 50}%</span>
                  </div>

                  {/* Position Y */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Y</span>
                    <input type="range" min={0} max={100} step={1} value={watermark.y ?? 50} onChange={e => setWatermark({ y: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.y ?? 50}%</span>
                  </div>

                  {/* Rotation */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{tr('Tilt')}</span>
                    <input type="range" min={-180} max={180} step={1} value={watermark.rotation ?? -45} onChange={e => setWatermark({ rotation: Number(e.target.value) })}
                      className="w-20" />
                    <span className="text-xs text-muted-foreground w-8">{watermark.rotation ?? -45}°</span>
                    <button onClick={() => setWatermark({ x: 50, y: 50, rotation: 0 })}
                      className="px-2 py-1 text-xs border border-border rounded text-muted-foreground hover:bg-muted transition">
                      {tr('Center')}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{tr('Opacity')}</span>
                <input type="range" min={2} max={40} value={watermark.opacity} onChange={e => setWatermark({ opacity: Number(e.target.value) })}
                  className="w-20" />
                <span className="text-xs text-muted-foreground w-6">{watermark.opacity}%</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Add section */}
        <div className="relative">
          <button onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 border border-border text-foreground px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition">
            <Plus size={14} /> {tr('Add Section')}
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-30 py-1 min-w-[180px]">
              {ADD_OPTIONS.map(o => (
                <button key={o.type} onClick={() => addSection(o.type)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition">
                  {tr(o.label)}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
          <Save size={14} />
          {saving ? tr('Saving…') : tr('Save Design')}
        </button>
      </div>

      {/* ── Canvas ── */}
      <TextColorToolbar canvasRef={canvasRef} />
      <div className="max-w-3xl mx-auto">
        <p className="text-xs text-muted-foreground text-center mb-4">Click on any text to edit · Select text and pick a color to highlight · Drag handles to reorder</p>

        <div ref={canvasRef} className="shadow-sm border border-[#e4e4e7] rounded-xl p-10 pl-14" style={{
          fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#111',
          position: 'relative', overflow: 'hidden', background: config.bgColor || '#ffffff',
          /* Force light-mode CSS vars so dark-mode global rules don't bleed in */
          '--background': '#f8f8f8', '--foreground': '#09090b',
          '--card': '#ffffff', '--card-foreground': '#09090b',
          '--muted': '#f4f4f5', '--muted-foreground': '#71717a',
          '--border': '#e4e4e7', '--input': '#ffffff',
          '--primary': '#F03E2F', '--primary-foreground': '#ffffff',
          '--destructive': '#ef4444', '--ring': '#F03E2F',
        } as React.CSSProperties}>
          {/* Watermark */}
          {watermark.enabled && (() => {
            const opacity = watermark.opacity / 100
            const rotation = watermark.rotation ?? -45
            const x = watermark.x ?? 50
            const y = watermark.y ?? 50
            const base: React.CSSProperties = { position: 'absolute', top: `${y}%`, left: `${x}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, pointerEvents: 'none', userSelect: 'none', zIndex: 0 }
            if ((watermark.type ?? 'text') === 'logo') {
              const src = watermark.logoUrl || schoolLogo
              const size = watermark.size ?? 240
              return src ? <img src={src} alt="" style={{ ...base, width: size, height: size, objectFit: 'contain', opacity }} /> : null
            }
            return <div style={{ ...base, fontSize: watermark.size ?? 72, fontWeight: 'bold', opacity, color: watermark.color, whiteSpace: 'nowrap' }}>{watermark.text || schoolName}</div>
          })()}
          {sections.map((sec, i) => (
            <SectionWrap key={sec.id} index={i} total={sections.length}
              onMove={d => moveSection(i, d)} onDelete={() => deleteSection(i)}
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => { e.preventDefault() }}
              onDrop={() => handleDrop(i)}
              dragging={dragIndex === i}>
              {sec.type === 'header' && (
                <RenderHeader sec={sec} color={config.primaryColor} schoolName={schoolName} schoolType={schoolType} schoolLogo={schoolLogo} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'student_info' && (
                <RenderStudentInfo sec={sec} color={config.primaryColor} schoolName={schoolName} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'marks_table' && (
                <RenderMarksTable sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'summary' && (
                <RenderSummary sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'remarks' && (
                <RenderRemarks sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'signatures' && (
                <RenderSignatures sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'text_block' && (
                <RenderTextBlock sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'divider' && (
                <RenderDivider sec={sec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
            </SectionWrap>
          ))}

          {sections.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No sections yet.</p>
              <p className="text-xs mt-1">Choose a template above or use "Add Section" to start.</p>
            </div>
          )}
        </div>
      </div>

      {showAddMenu && <div className="fixed inset-0 z-20" onClick={() => setShowAddMenu(false)} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      </div>
    </>
  )
}
