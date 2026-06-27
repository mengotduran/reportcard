'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getTemplateApi, saveTemplateApi, getDefaultLayout, getDefaultLayoutForType,
  TemplateConfig, TemplateName, TEMPLATE_DEFAULTS,
  LayoutSection, InfoRow, SummaryBox, SignatureLine,
  HeaderSec, StudentInfoSec, MarksTableSec, SummarySec,
  RemarksSec, SignaturesSec, TextBlockSec, DividerSec, GradingLegendSec,
  DEFAULT_TRANSCRIPT_LEGEND, marksColumnOrder, MARKS_COL_LABELS,
  SpreadsheetTable, SheetRow, seedMarksTableSection,
} from '@/lib/api/reportCardTemplate'
import { useAuthStore as _useAuthStore } from '@/lib/store/auth.store'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { Save, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Monitor, LayoutTemplate } from 'lucide-react'
import { PrintableTranscript } from '@/components/ui/PrintableTranscript'
import type { StudentTranscript } from '@/lib/api/reportcards'
import { useT } from '@/lib/i18n'
import { DEFAULT_UNIVERSITY_RANGES, DEFAULT_CLASSIFICATION_BANDS } from '@/lib/api/gradingScale'
import {
  SpreadsheetGrid, SpreadsheetToolbar, SheetCtx, GlobalSheetCtx,
  ensureSpreadsheet, makeEmptySpreadsheet,
  SHEET_FIELD_OPTIONS, SheetRange,
} from '@/components/ui/SpreadsheetEditor'

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

// ── University sample data (scores /100, GPA derived from DEFAULT_UNIVERSITY_RANGES) ──
const U_SEQ1    = [23, 19, 25, 17, 21]         // CA /30
const U_SEQ2    = [53, 43, 58, 39, 50]         // Exam /70
const U_SCORES  = U_SEQ1.map((s, i) => s + U_SEQ2[i])  // [76, 62, 83, 56, 71]
const U_CREDITS = [3, 3, 3, 3, 4]
function _gpForScore(score: number) {
  const sorted = [...DEFAULT_UNIVERSITY_RANGES].sort((a, b) => b.minScore - a.minScore)
  const r = sorted.find(x => score >= x.minScore && score <= x.maxScore)
  return { grade: r?.grade ?? 'F', gp: r?.gradePoint ?? 0 }
}
const U_GP     = U_SCORES.map(_gpForScore)
const U_WP     = U_GP.map((g, i) => g.gp * U_CREDITS[i])  // [10.5, 9.0, 12.0, 7.5, 14.0]
const U_TOT_CR = U_CREDITS.reduce((a, b) => a + b, 0)      // 16
const U_TOT_WP = U_WP.reduce((a, b) => a + b, 0)           // 53.0
const U_GPA    = U_TOT_CR > 0 ? U_TOT_WP / U_TOT_CR : 0   // 3.3125
const U_CLASS  = [...DEFAULT_CLASSIFICATION_BANDS].sort((a, b) => b.min - a.min)
                   .find(b => U_GPA >= b.min && U_GPA <= b.max)?.label ?? 'Fail'

const SD_UNI = {
  student: {
    name: 'Nguemo Alice',
    studentId: 'UNI/2025/HND/3/COMP1/042',
    classLevel: 'HND Computer Science - Level 1',
    guardianName: '—',
    gender: 'F',
  },
  term:        { name: 'First Semester', session: '2024/2025' },
  subjects:    ['Introduction to Programming', 'Mathematics for Computing', 'Computer Architecture', 'Database Management', 'Operating Systems'],
  codes:       ['CS101', 'MA101', 'CS102', 'DB201', 'CS201'],
  entries:     U_SCORES,
  seq1:        U_SEQ1,
  seq2:        U_SEQ2,
  grades:      U_GP.map(g => g.grade),
  remarks:     ['Very Good', 'Good', 'Excellent', 'Fairly Good', 'Very Good'],
  juryDecisions: ['VALIDATED', 'VALIDATED', 'VALIDATED', 'VALIDATED', 'VALIDATED'],
  position:    3,
}

// ── Mock StudentTranscript for transcript template canvas preview ─────────────
const MOCK_TRANSCRIPT: StudentTranscript = {
  student: {
    id: 'mock', name: SD_UNI.student.name, studentId: SD_UNI.student.studentId,
    classLevel: SD_UNI.student.classLevel, gender: SD_UNI.student.gender,
  },
  school: { name: 'Your University Name', logo: null, type: 'UNIVERSITY', language: 'EN' },
  session: SD_UNI.term.session,
  reportCards: [
    {
      id: 'mock-1',
      term: { id: 'mock-1', name: 'First Semester', session: SD_UNI.term.session },
      entries: SD_UNI.subjects.map((name, i) => ({
        id: `me-${i}`, score: SD_UNI.entries[i], seq1Score: SD_UNI.seq1[i], seq2Score: SD_UNI.seq2[i],
        subject: { id: `ms-${i}`, name, code: SD_UNI.codes[i], credit: U_CREDITS[i], term: 'First Semester', classLevel: SD_UNI.student.classLevel },
      })),
    },
    {
      id: 'mock-2',
      term: { id: 'mock-2', name: 'Second Semester', session: SD_UNI.term.session },
      entries: SD_UNI.subjects.map((name, i) => ({
        id: `me2-${i}`, score: Math.max(40, SD_UNI.entries[i] - 5), seq1Score: SD_UNI.seq1[i] - 3, seq2Score: SD_UNI.seq2[i] - 2,
        subject: { id: `ms-${i}`, name, code: SD_UNI.codes[i], credit: U_CREDITS[i], term: 'Second Semester', classLevel: SD_UNI.student.classLevel },
      })),
    },
  ],
  maxScore: 100,
  gradingScale: DEFAULT_UNIVERSITY_RANGES,
  classificationBands: DEFAULT_CLASSIFICATION_BANDS,
}

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

function resolveField(field: string, schoolName: string, schoolType?: string) {
  const isUni = schoolType === 'UNIVERSITY'
  const stu  = isUni ? SD_UNI.student : SD.student
  const term = isUni ? SD_UNI.term    : SD.term
  const map: Record<string, string> = {
    'student.name':        stu.name,
    'student.studentId':   stu.studentId,
    'student.classLevel':  stu.classLevel,
    'student.guardianName': stu.guardianName,
    'student.gender':      isUni ? SD_UNI.student.gender : '—',
    'term.name':           term.name,
    'term.session':        term.session,
    'school.name':         schoolName,
  }
  return map[field] ?? field
}

function resolveSummary(field: string, schoolType?: string) {
  if (schoolType === 'UNIVERSITY') {
    if (field === 'credits')        return String(U_TOT_CR)
    if (field === 'gpa')            return U_GPA.toFixed(2)
    if (field === 'cgpa')           return U_GPA.toFixed(2)
    if (field === 'classification') return U_CLASS
  }
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
  const [leftVer,  setLeftVer]  = useState(0)
  const [rightVer, setRightVer] = useState(0)

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
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!sec.officialHeader}
            onChange={e => {
              const on = e.target.checked
              const patch: Partial<HeaderSec> = { officialHeader: on }
              if (on && !sec.leftText) patch.leftText = `HIGHER INSTITUTE OF\nTECHNOLOGY AND MANAGEMENT\n${schoolName}\nINSTITUT SUPERIEUR EN\nTECHNOLOGIE ET EN GESTION`
              if (on && !sec.rightText) patch.rightText = `REPUBLIC OF CAMEROON\nPeace-Work-Fatherland\nREPUBLIQUE DU CAMEROUN\nPaix-Travail-Patrie\n\nMINISTRY OF HIGHER EDUCATION\nMINISTERE DE L'ENSEIGNEMENT SUPERIEUR`
              if (on && !sec.subtitle) patch.subtitle = `Email: school@mail.com  |  WEB: www.school.com  |  TEL: +000 000 000 000  |  P.O.Box 000 City, Country`
              update({ ...sec, ...patch })
            }} />
          {t('Official (logo center)')}
        </label>
      </div>

      {/* Rendered header */}
      {sec.officialHeader ? (
        /* Three-column official layout: left text | logo | right text */
        (() => {
          const leftLines  = (sec.leftText  ?? '').split('\n')
          const rightLines = (sec.rightText ?? '').split('\n')
          const midIdx   = Math.floor(leftLines.length / 2)
          const blankIdx = rightLines.findIndex(l => l.trim() === '')

          const toHtml = (lines: string[], align: 'left'|'right') =>
            lines.map((line, i) => {
              const big     = align === 'left' && i === midIdx
              const inMin   = align === 'right' && blankIdx >= 0 && i > blankIdx
              const italic  = align === 'right' && /[a-z]/.test(line)
              const fs      = big ? 14 : inMin ? 8.5 : 10
              const fw      = inMin ? 'normal' : 'bold'
              const fi      = italic ? 'italic' : 'normal'
              const lh      = big ? 1.1 : 1.45
              const ls      = big ? '1px' : '0'
              const mg      = big ? '3px 0' : '0'
              const mh      = line.trim() ? '' : `min-height:${align==='left'?4:5}px;`
              const txt     = line || '\u00A0'
              return `<div style="font-family:Arial,sans-serif;font-size:${fs}px;font-weight:${fw};font-style:${fi};line-height:${lh};letter-spacing:${ls};margin:${mg};text-align:${align};${mh}">${txt}</div>`
            }).join('')

          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start', marginBottom: 4 }}>
                <div
                  key={leftVer}
                  contentEditable suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: toHtml(leftLines, 'left') }}
                  onBlur={e => { setLeftVer(v => v + 1); update({ ...sec, leftText: e.currentTarget.innerText.trim() }) }}
                  style={{ cursor: 'text', outline: 'none', width: '100%', borderRadius: 3, padding: 2 }}
                  title="Click to edit"
                />
                <div style={{ textAlign: 'center', alignSelf: 'center' }}>{LogoEl}</div>
                <div
                  key={rightVer + 10000}
                  contentEditable suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: toHtml(rightLines, 'right') }}
                  onBlur={e => { setRightVer(v => v + 1); update({ ...sec, rightText: e.currentTarget.innerText.trim() }) }}
                  style={{ cursor: 'text', outline: 'none', width: '100%', borderRadius: 3, padding: 2 }}
                  title="Click to edit"
                />
              </div>
              <div style={{ textAlign: 'center', fontSize: 8.5, color: '#444', borderTop: `1px solid ${color}22`, paddingTop: 3, marginTop: 2 }}>
                <ET value={sec.subtitle} onChange={v => update({ ...sec, subtitle: v })}
                  placeholder="Email: school@mail.com  |  WEB: www.school.com  |  TEL: 000000000  |  P.O.Box 000 City, Country"
                  style={{ display: 'block', fontSize: 8.5, color: '#444' }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <ET value={sec.reportTitle} onChange={v => update({ ...sec, reportTitle: v })}
                  style={{ display: 'block', fontSize: 14, fontWeight: 'bold', color, letterSpacing: 3, textTransform: 'uppercase' }} />
              </div>
            </>
          )
        })()
      ) : sec.showLogo && sec.logoPosition === 'center' ? (
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

function RenderStudentInfo({ sec, color, schoolName, schoolType, update }: { sec: StudentInfoSec; color: string; schoolName: string; schoolType?: string; update: (s: StudentInfoSec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  const FIELD_OPTIONS = [
    { label: 'Student Name',  value: 'student.name' },
    { label: 'Student ID',    value: 'student.studentId' },
    { label: 'Class',         value: 'student.classLevel' },
    { label: 'Gender',        value: 'student.gender' },
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
              sampleText={resolveField(row.field, schoolName, schoolType)}
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

function RenderMarksTable({ sec, color, schoolType, update }: { sec: MarksTableSec; color: string; schoolType?: string; update: (s: MarksTableSec) => void }) {
  const isUni = schoolType === 'UNIVERSITY'

  // Preview value for each m:* field key (shows row 0 of sample data)
  const resolveMarksPreviewField = (field: string): string => {
    if (!field.startsWith('m:')) return ''
    const k = field.slice(2)
    if (k === 'sn') return '1'
    if (isUni) {
      switch (k) {
        case 'subject':      return SD_UNI.subjects[0] ?? ''
        case 'code':         return SD_UNI.codes[0]    ?? ''
        case 'seq1':         return String(SD_UNI.seq1[0])
        case 'seq2':         return String(SD_UNI.seq2[0])
        case 'score':        return String(SD_UNI.entries[0])
        case 'grade':        return SD_UNI.grades[0]   ?? ''
        case 'gradePoint':   return U_GP[0] ? U_GP[0].gp.toFixed(1) : '—'
        case 'weighted':     return U_WP[0] != null ? U_WP[0].toFixed(1) : '—'
        case 'credit':       return String(U_CREDITS[0])
        case 'evaluation':   return SD_UNI.remarks[0]  ?? '—'
        case 'juryDecision': return 'VALIDATED'
        default:             return `[${k}]`
      }
    }
    switch (k) {
      case 'subject': return SD.subjects[0] ?? ''
      case 'coef':    return '1'
      case 'seq1':    return String(SD.seq1[0])
      case 'seq2':    return String(SD.seq2[0])
      case 'score':   return String(SD.entries[0])
      case 'grade':   return SD.grades[0]   ?? ''
      case 'remarks': return SD.remarks[0]  ?? ''
      case 'min':     return '10.0'
      case 'avg':     return '13.5'
      case 'max':     return '18.0'
      default:        return `[${k}]`
    }
  }

  const seedMarksTable = () => update({ ...sec, template: seedMarksTableSection(sec, color, schoolType) })
  // sec.template is guaranteed by ensureMarksTables() at load + newSection()
  const tpl: SpreadsheetTable = sec.template ?? seedMarksTableSection(sec, color, schoolType)

  const smallBtn: React.CSSProperties = {
    fontSize: 10, padding: '2px 8px', border: '1px solid #e5e7eb',
    borderRadius: 3, background: '#fff', color: '#374151', cursor: 'pointer',
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <SpreadsheetGrid
        table={tpl}
        onChange={t => update({ ...sec, template: t })}
        resolveField={resolveMarksPreviewField}
        color={color}
        marksKeyMode
        marksKeyOptions={SHEET_FIELD_OPTIONS.filter(o => o.marks && !(isUni && o.value === 'm:coef'))}
      />
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#94a3b8', flexWrap: 'wrap' }}>
        <span>Highlighted row repeats per subject. Double-click any data cell to choose its key.</span>
        <button style={smallBtn} onClick={seedMarksTable}>↺ Reseed from defaults</button>
      </div>
    </div>
  )
}

function RenderSummary({ sec, color, schoolType, update }: { sec: SummarySec; color: string; schoolType?: string; update: (s: SummarySec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  const isUni = schoolType === 'UNIVERSITY'
  const FIELD_OPTIONS = isUni ? [
    { label: 'Total Credits',  value: 'credits' },
    { label: 'Semester GPA',   value: 'gpa' },
    { label: 'Cumulative GPA', value: 'cgpa' },
    { label: 'Classification', value: 'classification' },
  ] : [
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
              <ColorableCell sampleText={resolveSummary(box.field, schoolType)} color={sec.valueColor || color}
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

const LEGEND_ROWS_STATIC = [
  { abbr: 'I',    meaning: 'Incomplete' },
  { abbr: 'X',    meaning: 'Absent' },
  { abbr: '*',    meaning: 'After resit' },
  { abbr: 'GP',   meaning: 'Grade Point' },
  { abbr: 'GPA',  meaning: 'Grade Pt Average' },
  { abbr: 'CGPA', meaning: 'Cumulative GPA' },
  { abbr: 'WP',   meaning: 'Credit × GP' },
]

const MINI_FIELD_OPTIONS = [
  { label: 'Credits Earned', value: 'credits' },
  { label: 'Semester GPA',   value: 'gpa' },
  { label: 'Cumulative GPA', value: 'cgpa' },
  { label: 'Classification', value: 'classification' },
  { label: 'Total Score',    value: 'total' },
  { label: 'Average',        value: 'average' },
  { label: 'Position',       value: 'position' },
  { label: 'Grade',          value: 'grade' },
]

function RenderGradingLegend({ sec, color, update }: { sec: GradingLegendSec; color: string; update: (s: GradingLegendSec) => void }) {
  const t = useT()
  const rgb = hexRgb(color)
  const gradeRows = [...DEFAULT_UNIVERSITY_RANGES].sort((a, b) => b.minScore - a.minScore)
  const bandRows  = [...DEFAULT_CLASSIFICATION_BANDS].sort((a, b) => b.min - a.min)
  const maxRows   = Math.max(
    sec.showGradeSystem    ? gradeRows.length          : 0,
    sec.showClassification ? bandRows.length           : 0,
    sec.showLegend         ? LEGEND_ROWS_STATIC.length : 0,
  )
  const sepR:  React.CSSProperties = { borderRight: '1px solid #d1d5db' }
  const cell:  React.CSSProperties = { padding: '2px 6px', fontSize: 10, borderBottom: '1px solid #eef2f7', borderRight: '1px solid #e5e7eb', textAlign: 'center' }
  const cellL: React.CSSProperties = { ...cell, textAlign: 'left' }
  const hdr:   React.CSSProperties = { ...cell,  fontWeight: 'bold', backgroundColor: `rgba(${rgb},0.08)` }
  const hdrL:  React.CSSProperties = { ...cellL, fontWeight: 'bold', backgroundColor: `rgba(${rgb},0.08)` }
  const colX:  React.CSSProperties = { background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 9, padding: '0 1px', lineHeight: 1, verticalAlign: 'middle' }
  const rowX:  React.CSSProperties = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 10, padding: '0 2px', lineHeight: 1 }

  // ── SpreadsheetTable CRUD for left/right sides ──────────────────────────
  const makeSpreadCrud = (side: 'leftTables' | 'rightTables', layoutKey: 'leftLayout' | 'rightLayout') => {
    const raw: any[] = (sec as any)[side] ?? []
    const ts: SpreadsheetTable[] = raw.map(ensureSpreadsheet)
    const upd = (patch: Partial<GradingLegendSec>) => update({ ...sec, ...patch })
    const setTables = (next: SpreadsheetTable[]) => upd({ [side]: next } as any)
    return {
      tables: ts,
      layout: ((sec as any)[layoutKey] ?? 'columns') as 'columns' | 'rows',
      setLayout:   (l: 'columns' | 'rows') => upd({ [layoutKey]: l } as any),
      setTable:    (nt: SpreadsheetTable) => setTables(ts.map(x => x.id === nt.id ? nt : x)),
      deleteTable: (id: string) => setTables(ts.filter(x => x.id !== id)),
      addTable:    () => setTables([...ts, makeEmptySpreadsheet()]),
    }
  }
  const L = makeSpreadCrud('leftTables',  'leftLayout')
  const R = makeSpreadCrud('rightTables', 'rightLayout')


  // Seed built-in grade system table as an editable SpreadsheetTable
  const seedBuiltin = () => {
    const headers = [
      ...(sec.showGradeSystem    ? ['Grade', 'Mark', 'GP'] : []),
      ...(sec.showClassification ? ['Classification'] : []),
      ...(sec.showLegend         ? ['Legend'] : []),
    ]
    if (!headers.length) return
    const ts = Date.now()
    const hRow: SheetRow = {
      id: `rbh_${ts}`,
      cells: headers.map(h => ({ text: h, bold: true, align: 'center' as const, bgColor: color, textColor: '#fff' })),
    }
    const dataRows: SheetRow[] = Array.from({ length: maxRows }, (_, i) => {
      const gr = gradeRows[i], br = bandRows[i], lr = LEGEND_ROWS_STATIC[i]
      return {
        id: `rbd_${ts}_${i}`,
        cells: [
          ...(sec.showGradeSystem ? [
            { text: gr?.grade ?? '', bold: true, textColor: gr?.color },
            { text: gr ? `${gr.minScore}–${gr.maxScore}` : '', align: 'center' as const },
            { text: gr ? (gr.gradePoint ?? 0).toFixed(1) : '', align: 'center' as const },
          ] : []),
          ...(sec.showClassification ? [
            { text: br ? `${br.min.toFixed(2)}–${br.max.toFixed(2)} / ${br.label}` : '' },
          ] : []),
          ...(sec.showLegend ? [
            { text: lr ? `${lr.abbr} = ${lr.meaning}` : '' },
          ] : []),
        ],
      }
    })
    update({ ...sec, builtinTable: { id: `builtin_${ts}`, title: t('Grade System'), colCount: headers.length, rows: [hRow, ...dataRows] } })
  }

  // Hidden cols/rows for the static built-in table
  const bHidCols = sec.hiddenCols ?? []
  const bHidRows = sec.hiddenRowIndices ?? []
  const vGrade   = ['grade','mark','gp'].filter(c => !bHidCols.includes(c))
  const showGS   = sec.showGradeSystem    && vGrade.length > 0
  const showCL   = sec.showClassification && !bHidCols.includes('classification')
  const showLE   = sec.showLegend         && !bHidCols.includes('legend')
  const lastGCol = vGrade[vGrade.length - 1] ?? ''
  const hideBuiltinCol = (key: string) => update({ ...sec, hiddenCols: [...bHidCols, key] })
  const showBuiltinCol = (key: string) => update({ ...sec, hiddenCols: bHidCols.filter(c => c !== key) })
  const hideBuiltinRow = (idx: number) => update({ ...sec, hiddenRowIndices: [...bHidRows, idx] })
  const restorableCols = bHidCols.filter(c =>
    (sec.showGradeSystem    && ['grade','mark','gp'].includes(c)) ||
    (sec.showClassification && c === 'classification') ||
    (sec.showLegend         && c === 'legend'),
  )

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Checkboxes */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
        {([['showGradeSystem','Grade system'],['showClassification','Classification'],['showLegend','Legend']] as const).map(([k, lbl]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={sec[k]} onChange={e => update({ ...sec, [k]: e.target.checked })} />
            {t(lbl)}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

        {/* LEFT — grade system table + optional extra spreadsheet tables */}
        <div style={{ flex: '1.6', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {((maxRows > 0 && L.tables.length > 0) || L.tables.length > 1) && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>Left layout:</span>
              {(['columns', 'rows'] as const).map(l => (
                <button key={l} onClick={() => L.setLayout(l)}
                  style={{ padding: '1px 6px', fontSize: 9, border: '1px solid', borderColor: L.layout === l ? color : '#d1d5db', background: L.layout === l ? color : 'white', color: L.layout === l ? 'white' : '#374151', borderRadius: 3, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: L.layout === 'rows' ? 'column' : 'row', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Built-in table */}
            {maxRows > 0 && (
              sec.builtinTable ? (
                <div style={{ flex: 1, minWidth: 220, border: `1px solid rgba(${rgb},0.25)`, borderRadius: 4, padding: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, fontWeight: 'bold', fontSize: 10, color, background: `rgba(${rgb},0.08)`, padding: '2px 6px', borderRadius: 3 }}>
                      <ET value={sec.builtinTable.title} onChange={v => update({ ...sec, builtinTable: { ...sec.builtinTable!, title: v } })} style={{ fontSize: 10, fontWeight: 'bold', color }} />
                    </div>
                    <button title="Reset to static" onClick={() => update({ ...sec, builtinTable: undefined })} style={{ fontSize: 9, color: '#94a3b8', border: '1px solid #e5e7eb', background: 'none', borderRadius: 3, padding: '1px 5px', cursor: 'pointer' }}>↺ reset</button>
                    <button title="Re-seed from grading scale" onClick={seedBuiltin} style={{ fontSize: 9, color, border: `1px solid ${color}`, background: 'none', borderRadius: 3, padding: '1px 5px', cursor: 'pointer' }}>↺ reseed</button>
                  </div>
                  <SpreadsheetGrid table={sec.builtinTable} onChange={nt => update({ ...sec, builtinTable: nt })} color={color} />
                  <button
                    onClick={() => update({ ...sec, builtinTable: undefined })}
                    style={{ marginTop: 6, fontSize: 9, color: '#6b7280', border: '1px solid #d1d5db', background: '#f9fafb', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', display: 'block', width: '100%' }}>
                    ← Back to static view
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  {(showGS || showCL || showLE) && (
                    <table style={{ borderCollapse: 'collapse', border: `1px solid rgba(${rgb},0.3)`, width: '100%' }}>
                      <thead>
                        <tr>
                          {showGS && <th colSpan={vGrade.length} style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center', ...((showCL || showLE) ? sepR : {}) }}>Grade System</th>}
                          {showCL && <th style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center', ...(showLE ? sepR : {}) }}>Classification</th>}
                          {showLE && <th style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'left' }}>Legend</th>}
                          <th style={{ backgroundColor: color, width: 16 }} />
                        </tr>
                        <tr>
                          {showGS && vGrade.includes('grade') && <th style={{ ...hdr, ...(lastGCol === 'grade' && (showCL || showLE) ? sepR : {}) }}>Grade <button style={colX} onClick={() => hideBuiltinCol('grade')}>×</button></th>}
                          {showGS && vGrade.includes('mark')  && <th style={{ ...hdr, ...(lastGCol === 'mark'  && (showCL || showLE) ? sepR : {}) }}>Mark  <button style={colX} onClick={() => hideBuiltinCol('mark')}>×</button></th>}
                          {showGS && vGrade.includes('gp')    && <th style={{ ...hdr, ...(lastGCol === 'gp'    && (showCL || showLE) ? sepR : {}) }}>GP    <button style={colX} onClick={() => hideBuiltinCol('gp')}>×</button></th>}
                          {showCL && <th style={{ ...hdrL, ...(showLE ? sepR : {}) }}>GPA / Remark <button style={colX} onClick={() => hideBuiltinCol('classification')}>×</button></th>}
                          {showLE && <th style={hdrL}>Legend <button style={colX} onClick={() => hideBuiltinCol('legend')}>×</button></th>}
                          <th style={{ ...hdr, backgroundColor: 'transparent', border: 'none', width: 16 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxRows }, (_, i) => i)
                          .filter(i => !bHidRows.includes(i))
                          .map(i => {
                            const gr = gradeRows[i], br = bandRows[i], lr = LEGEND_ROWS_STATIC[i]
                            return (
                              <tr key={i}>
                                {showGS && vGrade.includes('grade') && <td style={{ ...cell, color: gr?.color ?? 'inherit', fontWeight: gr ? 'bold' : 'normal', ...(lastGCol === 'grade' && (showCL || showLE) ? sepR : {}) }}>{gr?.grade ?? ''}</td>}
                                {showGS && vGrade.includes('mark')  && <td style={{ ...cell, ...(lastGCol === 'mark' && (showCL || showLE) ? sepR : {}) }}>{gr ? `${gr.minScore}–${gr.maxScore}` : ''}</td>}
                                {showGS && vGrade.includes('gp')    && <td style={{ ...cell, ...(lastGCol === 'gp'   && (showCL || showLE) ? sepR : {}) }}>{gr ? (gr.gradePoint ?? 0).toFixed(1) : ''}</td>}
                                {showCL && <td style={{ ...cellL, ...(showLE ? sepR : {}) }}>{br ? <>{br.min.toFixed(2)}–{br.max.toFixed(2)} / <strong>{br.label}</strong></> : ''}</td>}
                                {showLE && <td style={cellL}>{lr ? <><strong style={{ minWidth: 28, display: 'inline-block' }}>{lr.abbr}</strong> = {lr.meaning}</> : ''}</td>}
                                <td style={{ padding: '1px', borderBottom: '1px solid #eef2f7', textAlign: 'center', width: 16 }}>
                                  <button style={rowX} onClick={() => hideBuiltinRow(i)}>×</button>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  )}
                  {(restorableCols.length > 0 || bHidRows.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                      {restorableCols.map(c => (
                        <button key={c} onClick={() => showBuiltinCol(c)} style={{ fontSize: 9, padding: '1px 5px', border: `1px solid ${color}`, background: 'none', color, borderRadius: 3, cursor: 'pointer' }}>+{c}</button>
                      ))}
                      {bHidRows.length > 0 && (
                        <button onClick={() => update({ ...sec, hiddenRowIndices: [] })} style={{ fontSize: 9, padding: '1px 5px', border: '1px solid #9ca3af', background: 'none', color: '#6b7280', borderRadius: 3, cursor: 'pointer' }}>
                          restore {bHidRows.length} row{bHidRows.length > 1 ? 's' : ''}
                        </button>
                      )}
                    </div>
                  )}
                  <button onClick={seedBuiltin} style={{ marginTop: 4, fontSize: 9, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 8px', borderRadius: 3, cursor: 'pointer' }}>
                    ✎ Make editable (spreadsheet)
                  </button>
                </div>
              )
            )}

            {/* Extra left spreadsheet tables */}
            {L.tables.map(st => {
              return (
                <div key={st.id} style={{ flex: 1, minWidth: 180, border: `1px solid rgba(${rgb},0.25)`, borderRadius: 4, padding: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, fontWeight: 'bold', fontSize: 10, color, background: `rgba(${rgb},0.08)`, padding: '2px 6px', borderRadius: 3 }}>
                      <ET value={st.title} onChange={v => L.setTable({ ...st, title: v })} style={{ fontSize: 10, fontWeight: 'bold', color }} />
                    </div>
                    <button onClick={() => L.deleteTable(st.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  </div>
                  <SpreadsheetGrid table={st} onChange={nt => L.setTable(nt)} color={color} />
                </div>
              )
            })}
          </div>

          <button onClick={L.addTable} style={{ fontSize: 10, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}>
            + Add Table
          </button>
        </div>

        {/* RIGHT — configurable spreadsheet tables (university) or empty placeholder */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {R.tables.length > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>Right layout:</span>
              {(['columns', 'rows'] as const).map(l => (
                <button key={l} onClick={() => R.setLayout(l)}
                  style={{ padding: '1px 6px', fontSize: 9, border: '1px solid', borderColor: R.layout === l ? color : '#d1d5db', background: R.layout === l ? color : 'white', color: R.layout === l ? 'white' : '#374151', borderRadius: 3, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: R.layout === 'rows' ? 'column' : 'row', gap: 8, flexWrap: 'wrap' }}>
            {R.tables.map(st => {
              return (
                <div key={st.id} style={{ flex: 1, minWidth: 180, border: `1px solid rgba(${rgb},0.25)`, borderRadius: 4, padding: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, fontWeight: 'bold', fontSize: 10, color, background: `rgba(${rgb},0.08)`, padding: '2px 6px', borderRadius: 3 }}>
                      <ET value={st.title} onChange={v => R.setTable({ ...st, title: v })} style={{ fontSize: 10, fontWeight: 'bold', color }} />
                    </div>
                    <button onClick={() => R.deleteTable(st.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  </div>
                  <SpreadsheetGrid table={st} onChange={nt => R.setTable(nt)} color={color} />
                </div>
              )
            })}
          </div>
          <button onClick={R.addTable} style={{ fontSize: 10, color, border: `1px dashed ${color}`, background: 'none', padding: '2px 10px', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}>
            + Add Table
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Templates gallery ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'classic'  as TemplateName, label: 'Classic GCE',  color: '#1e3a5f' },
  { id: 'bilingual'as TemplateName, label: 'Bilingual',    color: '#1a5c1a' },
  { id: 'modern'   as TemplateName, label: 'Modern',       color: '#2563eb' },
  { id: 'official' as TemplateName, label: 'Official',     color: '#92400e' },
]

const ADD_OPTIONS = [
  { type: 'header'         as const, label: '🏷 Header' },
  { type: 'student_info'   as const, label: '👤 Student Info' },
  { type: 'marks_table'    as const, label: '📋 Marks Table' },
  { type: 'summary'        as const, label: '📊 Summary Boxes' },
  { type: 'grading_legend' as const, label: '🎓 Grading Legend' },
  { type: 'remarks'        as const, label: '💬 Remarks' },
  { type: 'signatures'     as const, label: '✍ Signatures' },
  { type: 'text_block'     as const, label: '📝 Text Block' },
  { type: 'divider'        as const, label: '── Divider' },
]

function newSection(type: LayoutSection['type'], color: string, schoolType?: string): LayoutSection {
  const id = `sec_${Date.now()}`
  if (type === 'text_block')   return { id, type, content: 'New text block', align: 'left' }
  if (type === 'divider')      return { id, type, style: 'solid' }
  if (type === 'remarks')      return { id, type, label: 'General Remarks' }
  if (type === 'signatures')   return { id, type, lines: [{ id: `s_${Date.now()}`, label: 'Signature' }] }
  if (type === 'summary')      return { id, type, boxes: [{ id: `b_${Date.now()}`, label: 'Total Score', field: 'total' }] }
  if (type === 'student_info') return { id, type, columns: 2, rows: [{ id: `r_${Date.now()}`, label: 'Student Name', field: 'student.name' }] }
  if (type === 'marks_table') {
    const sec: MarksTableSec = { id, type, showSeq1: true, showSeq2: true, showGrade: true, showRemarks: true }
    return { ...sec, template: seedMarksTableSection(sec, color, schoolType) }
  }
  if (type === 'grading_legend') return { id, type, showGradeSystem: true, showClassification: true, showLegend: true, legendText: DEFAULT_TRANSCRIPT_LEGEND }
  return { id, type: 'header', reportTitle: 'REPORT CARD', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' as const }
}

// Ensure every marks_table section has a seeded SpreadsheetTable template.
function ensureMarksTables(
  cfg: TemplateConfig & { sections: LayoutSection[] },
  schoolType: string,
): typeof cfg {
  return {
    ...cfg,
    sections: cfg.sections.map(sec =>
      sec.type === 'marks_table' && !sec.template
        ? { ...sec, template: seedMarksTableSection(sec, cfg.primaryColor, schoolType) }
        : sec
    ),
  }
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [colorText, setColorText] = useState(config.primaryColor)
  const [bgText, setBgText] = useState(config.bgColor || '#ffffff')
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Page-level spreadsheet toolbar state ──────────────────────────────────
  const activeTableIdRef   = useRef<string | null>(null)
  const activeTableRef     = useRef<SpreadsheetTable | null>(null)
  const activeSetTableRef  = useRef<((t: SpreadsheetTable) => void) | null>(null)
  const [pageActiveTableId, setPageActiveTableId] = useState<string | null>(null)
  const [sheetActiveSel, setSheetActiveSel]       = useState<SheetRange | null>(null)
  const [, setSheetTick]                          = useState(0)

  const sheetCtxValue = useMemo<GlobalSheetCtx>(() => ({
    onFocus: (table, setTable) => {
      activeTableIdRef.current  = table.id
      activeTableRef.current    = table
      activeSetTableRef.current = setTable
      setPageActiveTableId(table.id)
      setSheetActiveSel(null)
    },
    onSel: (tableId, sel) => {
      if (activeTableIdRef.current !== tableId) return
      setSheetActiveSel(sel)
    },
    onUpdate: (tableId, table, setTable) => {
      if (activeTableIdRef.current !== tableId) return
      activeTableRef.current    = table
      activeSetTableRef.current = setTable
    },
  }), [])

  // ── Add-section dropdown (fixed-position to clear sidebar) ────────────────
  const addMenuBtnRef   = useRef<HTMLButtonElement>(null)
  const [addMenuCoords, setAddMenuCoords] = useState<{ top: number; left: number } | null>(null)

  const schoolName = school?.name || 'Your School Name'
  const schoolType = school?.type || 'SECONDARY'
  const schoolLogo = school?.logo ?? null
  const isTranscript = schoolType === 'UNIVERSITY' && config.layoutType === 'transcript'
  const tc = config.transcriptConfig ?? {}
  const setTc = (patch: Partial<NonNullable<typeof config.transcriptConfig>>) =>
    setConfig(c => ({ ...c, transcriptConfig: { ...c.transcriptConfig, ...patch } }))
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
    const lang: 'EN' | 'FR' = school?.language === 'FR' ? 'FR' : 'EN'
    const sType = school?.type || 'SECONDARY'
    const ensure = (cfg: any) => ensureMarksTables(cfg, sType)
    getTemplateApi().then(({ config: saved }) => {
      if (saved && (saved as any).sections?.length > 0) {
        const base = getDefaultLayout((saved.template as TemplateName) || 'classic')
        const merged = ensure(localizeLayout({ ...base, ...saved } as any, lang))
        setConfig(merged)
        setColorText(merged.primaryColor)
        setBgText(merged.bgColor || '#ffffff')
      } else if (saved && Object.keys(saved).length > 0) {
        const tpl = (saved.template as TemplateName) || 'classic'
        const layout = getDefaultLayout(tpl)
        const merged = ensure(localizeLayout({ ...layout, ...saved, sections: layout.sections } as any, lang))
        setConfig(merged)
        setColorText(merged.primaryColor)
        setBgText(merged.bgColor || '#ffffff')
      } else {
        const layout = ensure(localizeLayout(getDefaultLayoutForType(school?.type), lang))
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
    const sec = newSection(type, config.primaryColor, schoolType)
    setConfig(c => ({ ...c, sections: [...c.sections, sec] }))
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
      {/* ── Sticky header (main row + optional spreadsheet toolbar row) ── */}
      <div className="sticky top-0 z-30 bg-card border-b border-border -mx-8 -mt-8 px-8 mb-6">
      <div className="py-3 flex items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">{tr('Report Card Design')}</h2>
        </div>

        {/* Template picker — hidden in transcript mode (fixed layout) */}
        {!isTranscript && (
          <div className="flex gap-1 ml-2">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => loadTemplate(t.id)} title={tr(t.label)}
                className="px-3 py-1 rounded text-xs font-medium border transition"
                style={{ borderColor: config.template === t.id ? t.color : '#e5e7eb', background: config.template === t.id ? t.color : 'white', color: config.template === t.id ? 'white' : '#374151' }}>
                {tr(t.label)}
              </button>
            ))}
          </div>
        )}

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

        {/* Add section — hidden in transcript mode */}
        {!isTranscript && (
          <button ref={addMenuBtnRef}
            onClick={() => {
              if (addMenuCoords) { setAddMenuCoords(null); return }
              const r = addMenuBtnRef.current?.getBoundingClientRect()
              if (r) setAddMenuCoords({ top: r.bottom + 6, left: r.left })
            }}
            className="flex items-center gap-1 border border-border text-foreground px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition">
            <Plus size={14} /> {tr('Add Section')}
          </button>
        )}

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
          <Save size={14} />
          {saving ? tr('Saving…') : tr('Save Design')}
        </button>
      </div>{/* end main row */}

      {/* Second row: transcript settings — shown only in transcript mode */}
      {isTranscript && (
        <div className="py-2 border-t border-border flex items-start gap-4 flex-wrap">
          {/* Report title */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Title</label>
            <input type="text"
              value={tc.reportTitle ?? ''}
              onChange={e => setTc({ reportTitle: e.target.value })}
              placeholder="Annual Transcript"
              className="border border-border rounded px-2 py-1 text-xs text-foreground bg-background w-40"
            />
          </div>

          {/* Academic year label */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Year label</label>
            <input type="text"
              value={tc.academicYearLabel ?? ''}
              onChange={e => setTc({ academicYearLabel: e.target.value })}
              placeholder="Academic Year"
              className="border border-border rounded px-2 py-1 text-xs text-foreground bg-background w-32"
            />
          </div>

          <div className="border-l border-border pl-4 flex items-center gap-3">
            {([
              ['showGradeSystem', 'Grade System'],
              ['showClassification', 'Classification'],
              ['showLegend', 'Legend'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none whitespace-nowrap">
                <input type="checkbox"
                  checked={tc[key] ?? true}
                  onChange={e => setTc({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="border-l border-border pl-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Dean label</label>
              <input type="text"
                value={tc.deanLabel ?? ''}
                onChange={e => setTc({ deanLabel: e.target.value })}
                placeholder="Dean of Studies' Signature"
                className="border border-border rounded px-2 py-1 text-xs text-foreground bg-background w-44"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Registrar label</label>
              <input type="text"
                value={tc.registrarLabel ?? ''}
                onChange={e => setTc({ registrarLabel: e.target.value })}
                placeholder="Registrar's Signature"
                className="border border-border rounded px-2 py-1 text-xs text-foreground bg-background w-44"
              />
            </div>
          </div>
        </div>
      )}

      {/* Third row: spreadsheet table toolbar — always in layout so sticky bar never resizes */}
      <div className="py-1.5 border-t border-border" style={{ color: '#374151', visibility: pageActiveTableId ? 'visible' : 'hidden' }}>
        <SpreadsheetToolbar
          table={pageActiveTableId ? activeTableRef.current : null}
          sel={pageActiveTableId ? sheetActiveSel : null}
          onChange={t => {
            if (activeSetTableRef.current) {
              activeSetTableRef.current(t)
              activeTableRef.current = t
              setSheetTick(n => n + 1)
            }
          }}
          onSelChange={r => setSheetActiveSel(r)}
          color={config.primaryColor}
        />
      </div>
      </div>{/* end sticky wrapper */}

      {/* ── Canvas ── */}
      <TextColorToolbar canvasRef={canvasRef} />
      <SheetCtx.Provider value={sheetCtxValue}>
      <div className="flex gap-5 items-start justify-center">

      {/* Main canvas column */}
      <div style={{ width: 740, minWidth: 0, flexShrink: 1 }}>
        {!isTranscript && <p className="text-xs text-muted-foreground text-center mb-4">Click on any text to edit · Select text and pick a color to highlight · Drag handles to reorder</p>}
        {isTranscript && <p className="text-xs text-muted-foreground text-center mb-4">Customize color and toggle sections on the right · The layout is fixed for the transcript style</p>}

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
          {/* Transcript canvas preview */}
          {isTranscript && (
            <PrintableTranscript
              data={{ ...MOCK_TRANSCRIPT, school: { ...MOCK_TRANSCRIPT.school, name: schoolName, logo: schoolLogo } }}
              primaryColor={config.primaryColor}
              showGradeSystem={tc.showGradeSystem ?? true}
              showClassification={tc.showClassification ?? true}
              showLegend={tc.showLegend ?? true}
              deanLabel={tc.deanLabel}
              registrarLabel={tc.registrarLabel}
              reportTitle={tc.reportTitle}
              academicYearLabel={tc.academicYearLabel}
            />
          )}

          {/* Standard section-based canvas */}
          {!isTranscript && sections.map((sec, i) => (
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
                <RenderStudentInfo sec={sec} color={config.primaryColor} schoolName={schoolName} schoolType={schoolType} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'marks_table' && (
                <RenderMarksTable sec={sec} color={config.primaryColor} schoolType={schoolType} update={s => updateSection(i, s)} />
              )}
              {sec.type === 'summary' && (
                <RenderSummary sec={sec} color={config.primaryColor} schoolType={schoolType} update={s => updateSection(i, s)} />
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
              {sec.type === 'grading_legend' && (
                <RenderGradingLegend sec={sec as GradingLegendSec} color={config.primaryColor} update={s => updateSection(i, s)} />
              )}
            </SectionWrap>
          ))}

          {!isTranscript && sections.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No sections yet.</p>
              <p className="text-xs mt-1">Choose a template above or use "Add Section" to start.</p>
            </div>
          )}
        </div>
      </div>{/* end canvas column */}

      {/* ── Right sidebar: Layout switcher (university only) ── */}
      {schoolType === 'UNIVERSITY' && (
        <div className="flex-shrink-0 sticky" style={{ width: 168, top: 110 }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <LayoutTemplate size={12} /> Layout
          </p>

          {/* Standard thumbnail */}
          <button
            onClick={() => setConfig(c => ({ ...c, layoutType: 'standard' }))}
            className="w-full mb-3 rounded-lg border-2 overflow-hidden transition"
            style={{ borderColor: !isTranscript ? config.primaryColor : '#e5e7eb', background: !isTranscript ? `${config.primaryColor}10` : '#f9fafb' }}
          >
            {/* Mini visual */}
            <div style={{ padding: '6px 6px 4px', height: 100, position: 'relative' }}>
              <div style={{ background: config.primaryColor, height: 14, borderRadius: 2, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 40, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 3 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ height: 4, background: '#e5e7eb', borderRadius: 1 }} />)}
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', background: `${config.primaryColor}22` }}>
                  {['Subject','Sc','Gr'].map(l => <div key={l} style={{ fontSize: 5, color: config.primaryColor, fontWeight: 'bold', padding: '1px 2px', borderRight: '1px solid #e5e7eb' }}>{l}</div>)}
                </div>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ height: 5, margin: '1px 2px', background: '#e5e7eb', borderRadius: 1 }} />
                    <div style={{ height: 5, margin: '1px 2px', background: '#e5e7eb', borderRadius: 1 }} />
                    <div style={{ height: 5, margin: '1px 2px', background: '#e5e7eb', borderRadius: 1 }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 3, display: 'flex', gap: 2 }}>
                {[50,40,60].map((w,i) => <div key={i} style={{ width: w, height: 8, background: `${config.primaryColor}30`, borderRadius: 2 }} />)}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: !isTranscript ? config.primaryColor : '#6b7280' }}>
              Standard
            </div>
          </button>

          {/* Transcript thumbnail */}
          <button
            onClick={() => setConfig(c => ({ ...c, layoutType: 'transcript' }))}
            className="w-full rounded-lg border-2 overflow-hidden transition"
            style={{ borderColor: isTranscript ? config.primaryColor : '#e5e7eb', background: isTranscript ? `${config.primaryColor}10` : '#f9fafb' }}
          >
            <div style={{ padding: '6px 6px 4px', height: 100, position: 'relative' }}>
              <div style={{ background: config.primaryColor, height: 14, borderRadius: 2, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 50, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
              </div>
              <div style={{ fontSize: 5, fontWeight: 'bold', color: config.primaryColor, marginBottom: 2 }}>FIRST SEMESTER</div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', background: `${config.primaryColor}22` }}>
                  {['CD','Title','Cr','Mk','Gr'].map(l => <div key={l} style={{ fontSize: 4, color: config.primaryColor, fontWeight: 'bold', padding: '1px 1px', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{l}</div>)}
                </div>
                {[0,1,2].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', borderTop: '1px solid #f0f0f0' }}>
                    {[0,1,2,3,4].map(j => <div key={j} style={{ height: 4, margin: '1px 1px', background: '#e5e7eb', borderRadius: 1 }} />)}
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', borderTop: '1px solid #ccc', background: '#f5f5f5' }}>
                  <div style={{ fontSize: 4, fontWeight: 'bold', padding: '1px 2px', gridColumn: '1/4' }}>TOTAL</div>
                  <div style={{ height: 4, margin: '2px 1px', background: '#ccc', borderRadius: 1 }} />
                  <div style={{ height: 4, margin: '2px 1px', background: '#ccc', borderRadius: 1 }} />
                </div>
              </div>
              <div style={{ marginTop: 3, display: 'flex', gap: 2 }}>
                <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 2, border: '1px solid #e5e7eb' }} />
                <div style={{ width: 44, height: 14, border: `1px solid ${config.primaryColor}55`, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 5, color: config.primaryColor, fontWeight: 'bold' }}>3.25</div>
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: isTranscript ? config.primaryColor : '#6b7280' }}>
              Transcript
            </div>
          </button>

        </div>
      )}

      </div>{/* end flex wrapper */}
      </SheetCtx.Provider>

      {/* Add-section dropdown — fixed-position so it floats above the sidebar */}
      {addMenuCoords && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAddMenuCoords(null)} />
          <div className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 w-max"
            style={{ top: addMenuCoords.top, left: addMenuCoords.left }}>
            {ADD_OPTIONS.map(o => (
              <button key={o.type} onClick={() => { addSection(o.type); setAddMenuCoords(null) }}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition whitespace-nowrap">
                {tr(o.label)}
              </button>
            ))}
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      </div>
    </>
  )
}
