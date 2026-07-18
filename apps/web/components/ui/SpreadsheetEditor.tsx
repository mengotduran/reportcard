'use client'
import React, { useState, useRef, useContext, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SpreadsheetTable, SheetCell, SheetRow, MiniTable } from '@/lib/api/reportCardTemplate'

// ── Global toolbar context ────────────────────────────────────────────────────
// Wrap the designer canvas with <SheetCtx.Provider> and any SpreadsheetGrid
// inside it will automatically register with the page-level toolbar.
export interface GlobalSheetCtx {
  /** Called when a cell in any grid is clicked — makes it the active table. */
  onFocus: (table: SpreadsheetTable, setTable: (t: SpreadsheetTable) => void) => void
  /** Called whenever selection changes inside the active grid. */
  onSel: (tableId: string, sel: SheetRange | null) => void
  /** Called by a grid after each render so the context ref stays fresh. */
  onUpdate: (tableId: string, table: SpreadsheetTable, setTable: (t: SpreadsheetTable) => void) => void
}
export const SheetCtx = React.createContext<GlobalSheetCtx | null>(null)

// ── Field options ─────────────────────────────────────────────────────────────
// marks?: true  → shown in "Marks row data" optgroup (for data rows in the marks table template)
export const SHEET_FIELD_OPTIONS: { value: string; label: string; marks?: true }[] = [
  { value: '',               label: '— free text —' },
  { value: 'credits',        label: 'Credits Earned' },
  { value: 'gpa',            label: 'Semester GPA' },
  { value: 'cgpa',           label: 'Cumul. GPA' },
  { value: 'average',        label: 'Average' },
  { value: 'classification', label: 'Classification' },
  { value: 'position',       label: 'Position' },
  { value: 'total_coeff',    label: 'Total Coeff.' },
  { value: 'student_name',   label: 'Student Name' },
  { value: 'class',          label: 'Class' },
  { value: 'term',           label: 'Term' },
  { value: 'session',        label: 'Session' },
  // Per-row marks fields (use in data rows of the marks table template)
  { value: 'm:sn',         label: 'S/N',           marks: true },
  { value: 'm:subject',    label: 'Subject Name',  marks: true },
  { value: 'm:coef',       label: 'Coefficient',   marks: true },
  { value: 'm:seq1',       label: 'Seq 1 Score',   marks: true },
  { value: 'm:seq2',       label: 'Seq 2 Score',   marks: true },
  { value: 'm:score',      label: 'Score/Total',   marks: true },
  { value: 'm:grade',      label: 'Grade',         marks: true },
  { value: 'm:remarks',    label: 'Remark',        marks: true },
  { value: 'm:code',       label: 'Course Code',   marks: true },
  { value: 'm:credit',     label: 'Credits',       marks: true },
  { value: 'm:gradePoint',   label: 'GPA',           marks: true },
  { value: 'm:evaluation',   label: 'Evaluation',    marks: true },
  { value: 'm:weighted',     label: 'Weight',        marks: true },
  { value: 'm:juryDecision', label: 'Jury Decision', marks: true },
  // Class-wide statistics (computed from all students in the class for the same subject)
  { value: 'm:min',         label: 'Min (class)',   marks: true },
  { value: 'm:avg',         label: 'Avg (class)',   marks: true },
  { value: 'm:max',         label: 'Max (class)',   marks: true },
]

// ── Selection types ───────────────────────────────────────────────────────────
export type SheetRange = { r1: number; c1: number; r2: number; c2: number }
type Pos = { r: number; c: number }

export function normRange(s: SheetRange): SheetRange {
  return { r1: Math.min(s.r1,s.r2), c1: Math.min(s.c1,s.c2), r2: Math.max(s.r1,s.r2), c2: Math.max(s.c1,s.c2) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid(): string { return `c_${Math.random().toString(36).slice(2, 9)}` }
function emptyRow(colCount: number): SheetRow {
  return { id: uid(), cells: Array.from({ length: colCount }, () => ({})) }
}

export function makeEmptySpreadsheet(title = 'Summary', rows = 3, cols = 2): SpreadsheetTable {
  return { id: `st_${Date.now()}`, title, colCount: cols, rows: Array.from({ length: rows }, () => emptyRow(cols)) }
}

export function ensureSpreadsheet(t: MiniTable | SpreadsheetTable | any): SpreadsheetTable {
  if ('colCount' in t) return t as SpreadsheetTable
  return {
    id: t.id, title: t.title ?? 'Summary', colCount: 2,
    rows: (t.rows ?? []).map((r: any) => ({
      id: r.id ?? uid(),
      cells: [
        { text: r.label ?? '', bold: true, align: 'left' as const },
        r.field ? { field: r.field as string } : { text: '' },
      ],
    })),
  }
}

// ── Pure table operations (all return new table, no mutation) ─────────────────

export function applyPatch(table: SpreadsheetTable, sel: SheetRange, patch: Partial<SheetCell>): SpreadsheetTable {
  const n = normRange(sel)
  return {
    ...table,
    rows: table.rows.map((row, ri) =>
      ri < n.r1 || ri > n.r2 ? row : {
        ...row,
        cells: row.cells.map((cell, ci) =>
          ci < n.c1 || ci > n.c2 || cell._consumed ? cell : { ...cell, ...patch },
        ),
      },
    ),
  }
}

export function applyToggle(table: SpreadsheetTable, sel: SheetRange, key: keyof SheetCell): SpreadsheetTable {
  const n = normRange(sel)
  let anyOn = false
  for (let r = n.r1; r <= n.r2 && !anyOn; r++)
    for (let c = n.c1; c <= n.c2; c++)
      if ((table.rows[r]?.cells[c] as any)?.[key]) { anyOn = true; break }
  return applyPatch(table, sel, { [key]: !anyOn } as Partial<SheetCell>)
}

export function applyMerge(
  table: SpreadsheetTable, sel: SheetRange,
): { table: SpreadsheetTable; newSel: SheetRange } {
  const n = normRange(sel)
  if (n.r1 === n.r2 && n.c1 === n.c2) return { table, newSel: sel }
  const anchor = { ...(table.rows[n.r1]?.cells[n.c1] ?? {}) }
  return {
    newSel: { r1: n.r1, c1: n.c1, r2: n.r1, c2: n.c1 },
    table: {
      ...table,
      rows: table.rows.map((row, ri) => ({
        ...row,
        cells: row.cells.map((cell, ci) => {
          if (ri === n.r1 && ci === n.c1)
            return { ...anchor, colSpan: n.c2-n.c1+1, rowSpan: n.r2-n.r1+1, _consumed: undefined }
          if (ri >= n.r1 && ri <= n.r2 && ci >= n.c1 && ci <= n.c2)
            return { _consumed: true as const }
          return cell
        }),
      })),
    },
  }
}

export function applyUnmerge(table: SpreadsheetTable, sel: SheetRange): SpreadsheetTable {
  const n = normRange(sel)
  const cell = table.rows[n.r1]?.cells[n.c1] ?? {}
  const cs = cell.colSpan ?? 1, rs = cell.rowSpan ?? 1
  if (cs === 1 && rs === 1) return table
  return {
    ...table,
    rows: table.rows.map((row, ri) => ({
      ...row,
      cells: row.cells.map((c, ci) => {
        if (ri === n.r1 && ci === n.c1) return { ...c, colSpan: undefined, rowSpan: undefined }
        if (ri >= n.r1 && ri < n.r1 + rs && ci >= n.c1 && ci < n.c1 + cs) return {}
        return c
      }),
    })),
  }
}

export function applyInsertRow(
  table: SpreadsheetTable, sel: SheetRange, after: boolean,
): { table: SpreadsheetTable; newSel: SheetRange } {
  const n = normRange(sel)
  const at = after ? n.r2 + 1 : n.r1
  const nr = [...table.rows]; nr.splice(at, 0, emptyRow(table.colCount))
  return { table: { ...table, rows: nr }, newSel: { r1: at, c1: 0, r2: at, c2: table.colCount - 1 } }
}

export function applyDeleteRows(table: SpreadsheetTable, sel: SheetRange): SpreadsheetTable {
  const n = normRange(sel)
  if (table.rows.length <= 1) return table
  return { ...table, rows: table.rows.filter((_, i) => i < n.r1 || i > n.r2) }
}

// Both column ops below walk each row's cells summing colSpan (default 1) to
// track each cell's true logical column range, rather than assuming array
// index === logical column. Plain rows (no merged cells) have colSpan 1
// everywhere, so this is a no-op there — but rows with a wide colSpan cell
// (e.g. a "TOTAL" banner spanning several columns, as in the Ledger template)
// have fewer array entries than colCount, and indexing by raw `ci` silently
// hit the wrong cell — deleting/inserting into a banner row wrote to whatever
// column happened to share that low index, and left its colSpan stale so it
// no longer matched the table's real width. Growing/shrinking colSpan here
// keeps every row's total logical width equal to colCount after the edit.
export function applyInsertCol(
  table: SpreadsheetTable, sel: SheetRange, after: boolean,
): { table: SpreadsheetTable; newSel: SheetRange } {
  const n = normRange(sel)
  const at = after ? n.c2 + 1 : n.c1   // logical column the new column is inserted before
  const ws = table.colWidths
  return {
    table: {
      ...table,
      colCount: table.colCount + 1,
      rows: table.rows.map(row => {
        const cells: SheetCell[] = []
        let col = 0
        let done = false
        for (const cell of row.cells) {
          const span = cell.colSpan ?? 1
          const start = col, end = col + span - 1
          if (!done && at === start) {
            cells.push({})
            col += 1
            done = true
          }
          if (!done && at > start && at <= end) {
            cells.push({ ...cell, colSpan: span + 1 })
            col += span + 1
            done = true
            continue
          }
          cells.push(cell)
          col += span
        }
        if (!done) {
          // Inserting at the very end: a single cell spanning the whole row
          // (a full-width title banner) grows with the table. A hero row shaped
          // [wide label…, value] (e.g. the transcript's "SEMESTER GPA: | 2.90"
          // or the ledger's TERM AVERAGE) grows its label instead, so the value
          // stays pinned to the table's outer edge rather than leaving a bare
          // gap after it. Anything else gets a fresh cell that carries over the
          // row's trailing style (so a banded TOTAL row's band keeps reaching
          // the edge) but none of its content.
          const last = cells[cells.length - 1]
          const secondLast = cells.length >= 2 ? cells[cells.length - 2] : null
          if (cells.length === 1 && (cells[0].colSpan ?? 1) === table.colCount)
            cells[0] = { ...cells[0], colSpan: table.colCount + 1 }
          else if (secondLast && (secondLast.colSpan ?? 1) > 1)
            cells[cells.length - 2] = { ...secondLast, colSpan: (secondLast.colSpan ?? 1) + 1 }
          else cells.push({ bgColor: last?.bgColor, textColor: last?.textColor, bold: last?.bold, align: last?.align })
        }
        return { ...row, cells }
      }),
      colWidths: ws ? [...ws.slice(0, at), ws[n.c1] ?? 80, ...ws.slice(at)] : undefined,
    },
    newSel: { r1: 0, c1: at, r2: table.rows.length - 1, c2: at },
  }
}

export function applyDeleteCols(table: SpreadsheetTable, sel: SheetRange): SpreadsheetTable {
  const n = normRange(sel)
  const newCount = table.colCount - (n.c2 - n.c1 + 1)
  if (newCount <= 0) return table
  return {
    ...table,
    colCount: newCount,
    rows: table.rows.map(row => {
      const cells: SheetCell[] = []
      let col = 0
      for (const cell of row.cells) {
        const span = cell.colSpan ?? 1
        const start = col, end = col + span - 1
        col += span
        if (start >= n.c1 && end <= n.c2) continue // fully inside the deleted range — drop
        if (end < n.c1 || start > n.c2) { cells.push(cell); continue } // no overlap — keep as-is
        // Partial overlap — shrink the span by however many of its columns are being deleted
        const overlap = Math.min(end, n.c2) - Math.max(start, n.c1) + 1
        const newSpan = span - overlap
        cells.push(newSpan > 1 ? { ...cell, colSpan: newSpan } : { ...cell, colSpan: undefined })
      }
      return { ...row, cells }
    }),
    colWidths: table.colWidths?.filter((_, ci) => ci < n.c1 || ci > n.c2),
  }
}

// ── Shared Toolbar ─────────────────────────────────────────────────────────────
// Standalone toolbar — can be placed anywhere; operates on the "active" table+sel.
export interface SpreadsheetToolbarProps {
  table:       SpreadsheetTable | null
  sel:         SheetRange | null
  onChange:    ((t: SpreadsheetTable) => void) | null
  onSelChange: ((r: SheetRange | null) => void) | null
  color:       string
}

export function SpreadsheetToolbar({ table, sel, onChange, onSelChange, color }: SpreadsheetToolbarProps) {
  const n      = sel && table ? normRange(sel) : null
  const anchor: SheetCell = n && table ? (table.rows[n.r1]?.cells[n.c1] ?? {}) : {}
  const canAct = !!(table && sel && onChange)

  const patch = (p: Partial<SheetCell>) => { if (canAct) onChange!(applyPatch(table!, sel!, p)) }
  const toggle = (k: keyof SheetCell) =>   { if (canAct) onChange!(applyToggle(table!, sel!, k)) }

  const merge = () => {
    if (!canAct) return
    const { table: t, newSel } = applyMerge(table!, sel!)
    onChange!(t); onSelChange?.(newSel)
  }
  const unmerge = () => { if (canAct) onChange!(applyUnmerge(table!, sel!)) }

  const insertRow = (after: boolean) => {
    if (!canAct) return
    const { table: t, newSel } = applyInsertRow(table!, sel!, after)
    onChange!(t); onSelChange?.(newSel)
  }
  const deleteRows = () => { if (canAct) { onChange!(applyDeleteRows(table!, sel!)); onSelChange?.(null) } }

  const insertCol = (after: boolean) => {
    if (!canAct) return
    const { table: t, newSel } = applyInsertCol(table!, sel!, after)
    onChange!(t); onSelChange?.(newSel)
  }
  const deleteCols = () => { if (canAct) { onChange!(applyDeleteCols(table!, sel!)); onSelChange?.(null) } }

  const patchAnchor = (p: Partial<SheetCell>) => {
    if (!n || !canAct) return
    onChange!({
      ...table!,
      rows: table!.rows.map((row, ri) => ri !== n.r1 ? row : {
        ...row, cells: row.cells.map((cell, ci) => ci !== n.c1 ? cell : { ...cell, ...p }),
      }),
    })
  }

  const btnBase: React.CSSProperties = {
    fontSize: 10, padding: '2px 5px', border: '1px solid #d1d5db', background: '#fff',
    color: '#374151',
    borderRadius: 3, cursor: 'pointer', minWidth: 22, textAlign: 'center' as const,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2,
    opacity: canAct ? 1 : 0.45,
  }
  const btnOn: React.CSSProperties = { background: color, color: '#fff', borderColor: color }

  const Btn = ({ label, tip, on, act, red, style }: {
    label: string; tip: string; on?: boolean; act: () => void; red?: boolean; style?: React.CSSProperties
  }) => (
    <button title={tip}
      style={{ ...btnBase, ...(on ? btnOn : {}), ...(red ? { color: '#ef4444' } : {}), ...style }}
      onMouseDown={e => { e.preventDefault(); act() }}>
      {label}
    </button>
  )
  const Vr = () => <div style={{ width: 1, height: 14, background: '#e2e8f0', margin: '0 1px', flexShrink: 0 }} />

  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: '4px 6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, alignItems: 'center', color: '#374151' }}>
      {!canAct && (
        <span style={{ fontSize: 9, color: '#94a3b8', marginRight: 4 }}>Click a cell to edit</span>
      )}
      {/* Format */}
      <Btn label="B" tip="Bold"      on={!!anchor.bold}      act={() => toggle('bold')}      style={{ fontWeight: 'bold' }} />
      <Btn label="I" tip="Italic"    on={!!anchor.italic}    act={() => toggle('italic')}    style={{ fontStyle: 'italic' }} />
      <Btn label="U" tip="Underline" on={!!anchor.underline} act={() => toggle('underline')} style={{ textDecoration: 'underline' }} />
      <Vr />
      {/* Align */}
      {(['left', 'center', 'right'] as const).map(a => (
        <Btn key={a} label={a[0].toUpperCase()} tip={`Align ${a}`} on={anchor.align === a} act={() => patch({ align: a })} />
      ))}
      <Vr />
      {/* Text color */}
      <label title="Text color" style={{ ...btnBase, padding: '1px 4px', position: 'relative', cursor: 'pointer' }}>
        <span style={{ borderBottom: `2px solid ${anchor.textColor ?? '#111'}`, lineHeight: 1.2 }}>A</span>
        <input type="color" value={anchor.textColor ?? '#111111'} onChange={e => patch({ textColor: e.target.value })}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none' }} />
      </label>
      {/* BG color */}
      <label title="Cell background" style={{ ...btnBase, padding: '1px 4px', position: 'relative', cursor: 'pointer' }}>
        <span style={{ background: anchor.bgColor ?? 'transparent', padding: '0 3px', border: '1px solid #e5e7eb', fontSize: 8, lineHeight: 1.4 }}>bg</span>
        <input type="color" value={anchor.bgColor ?? '#ffffff'} onChange={e => patch({ bgColor: e.target.value })}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none' }} />
      </label>
      <Btn label="✕bg" tip="Clear background" act={() => patch({ bgColor: undefined })} />
      <Vr />
      {/* Font size */}
      <input type="number" min={6} max={36} value={anchor.fontSize ?? 10} title="Font size"
        style={{ width: 32, fontSize: 9, border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 2px', textAlign: 'center', opacity: canAct ? 1 : 0.45, color: '#374151', background: '#fff' }}
        onChange={e => patch({ fontSize: Number(e.target.value) })} />
      <Vr />
      {/* Merge */}
      <Btn label="Merge" tip="Merge selected cells" act={merge} />
      <Btn label="Split" tip="Unmerge cell"         act={unmerge} />
      <Vr />
      {/* Rows */}
      <Btn label="↑Row" tip="Insert row above"        act={() => insertRow(false)} />
      <Btn label="↓Row" tip="Insert row below"        act={() => insertRow(true)} />
      <Btn label="×Row" tip="Delete selected row(s)"  act={deleteRows} red />
      <Vr />
      {/* Columns */}
      <Btn label="←Col" tip="Insert column left"         act={() => insertCol(false)} />
      <Btn label="→Col" tip="Insert column right"        act={() => insertCol(true)} />
      <Btn label="×Col" tip="Delete selected column(s)"  act={deleteCols} red />
      <Vr />
      {/* Field binding */}
      <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>Field:</span>
      <select value={anchor.field ?? ''} title="Bind anchor cell to live data"
        style={{ fontSize: 9, border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 2px', maxWidth: 110, opacity: canAct ? 1 : 0.45, color: '#374151', background: '#fff' }}
        onChange={e => {
          if (n) patchAnchor({ field: e.target.value || undefined, text: e.target.value ? undefined : anchor.text })
        }}>
        {SHEET_FIELD_OPTIONS.filter(o => !o.marks).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        <optgroup label="Marks row data">
          {SHEET_FIELD_OPTIONS.filter(o => o.marks).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      </select>
    </div>
  )
}

// ── MarksPicker ──────────────────────────────────────────────────────────────
// Portal dropdown for choosing a column key in marksKeyMode.
// Renders on document.body with position:fixed so it is never clipped by overflow:auto.
interface MarksPickerProps {
  anchorRect: DOMRect
  col: number
  currentKey: string
  color: string
  error: string | null
  options: typeof SHEET_FIELD_OPTIONS
  onPick: (key: string) => void
  onDelete: () => void
  onClose: () => void
}

function MarksPicker({ anchorRect, currentKey, color, error, options, onPick, onDelete, onClose }: MarksPickerProps) {
  const PICKER_H = 260
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const above = spaceBelow < PICKER_H && anchorRect.top > PICKER_H

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
    left: Math.min(anchorRect.left, window.innerWidth - 220),
    ...(above
      ? { bottom: window.innerHeight - anchorRect.top }
      : { top: anchorRect.bottom }),
    width: 210,
    background: '#fff',
    border: `2px solid ${color}`,
    borderRadius: 7,
    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    fontSize: 10,
  }

  return (
    <>
      {/* Click-away backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onMouseDown={e => { e.preventDefault(); onClose() }} />
      <div style={style} onMouseDown={e => e.stopPropagation()}>
        <div style={{ padding: '5px 8px 3px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 9 }}>
          Choose column key
        </div>
        {error && (
          <div style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', fontSize: 9, borderBottom: '1px solid #fecaca' }}>
            ⚠ {error}
          </div>
        )}
        <div style={{ maxHeight: PICKER_H - 50, overflowY: 'auto', padding: '3px 4px' }}>
          {options.map(o => {
            const active = currentKey === o.value
            return (
              <div key={o.value}
                onMouseDown={e => { e.preventDefault(); onPick(o.value) }}
                style={{
                  padding: '5px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                  background: active ? color : 'transparent',
                  color: active ? '#fff' : '#1e293b',
                  fontWeight: active ? 600 : 400,
                  opacity: (error && !active) ? 0.55 : 1,
                }}>
                <span>{o.label}</span>
                <span style={{ fontSize: 7.5, opacity: 0.55, fontFamily: 'monospace' }}>{o.value}</span>
              </div>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '3px 4px', display: 'flex', gap: 2 }}>
          <div onMouseDown={e => { e.preventDefault(); onDelete() }}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', color: '#dc2626',
              fontSize: 9, fontWeight: 600, background: '#fef2f2', textAlign: 'center' as const }}>
            Delete column
          </div>
          <div onMouseDown={e => { e.preventDefault(); onClose() }}
            style={{ padding: '4px 8px', borderRadius: 4, cursor: 'pointer', color: '#94a3b8', fontSize: 9 }}>
            Cancel
          </div>
        </div>
      </div>
    </>
  )
}

// ── SpreadsheetGrid ───────────────────────────────────────────────────────────
// Pure grid — no toolbar. Used inside SpreadsheetEditor and directly in the designer.
export interface SpreadsheetGridProps {
  table:          SpreadsheetTable
  onChange:       (t: SpreadsheetTable) => void
  color:          string
  resolveField?:  (field: string) => string
  // External selection control (for shared toolbar). If not provided, editor manages its own sel.
  sel?:           SheetRange | null
  onSelChange?:   (r: SheetRange | null) => void
  onFocusGained?: () => void  // called on any cell interaction so parent can make this the active table
  /** When true, double-click / Enter opens a column key picker instead of a free-text editor.
   *  Selecting a key updates the header cell text AND the _isDataRow data cell field for that column. */
  marksKeyMode?:   boolean
  /** Override the key options shown in the marks picker (defaults to all marks-flagged options). */
  marksKeyOptions?: { value: string; label: string }[]
}

export function SpreadsheetGrid({
  table, onChange, color, resolveField,
  sel: extSel, onSelChange, onFocusGained,
  marksKeyMode, marksKeyOptions,
}: SpreadsheetGridProps) {
  const [internalSel, setInternalSel] = useState<SheetRange | null>(null)
  const [editPos, setEditPos] = useState<Pos | null>(null)
  const [editVal, setEditVal] = useState('')
  const [pickerCol, setPickerCol] = useState<number | null>(null)
  const [pickerAnchorRect, setPickerAnchorRect] = useState<DOMRect | null>(null)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const drag = useRef<Pos | null>(null)

  // Context for page-level global toolbar
  const ctx = useContext(SheetCtx)
  // Keep a ref so context callbacks always capture the latest table/onChange
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  // Notify context on every render so the active-table ref stays fresh
  useEffect(() => { ctx?.onUpdate(table.id, table, onChangeRef.current) })

  // Controlled if onSelChange provided, otherwise internal
  const controlled = onSelChange !== undefined
  const sel        = controlled ? (extSel ?? null) : internalSel
  const setSel     = (r: SheetRange | null) => {
    if (controlled) onSelChange!(r)
    else setInternalSel(r)
    ctx?.onSel(table.id, r)
  }

  const { rows, colCount } = table
  const n      = sel ? normRange(sel) : null
  const inSel  = (r: number, c: number) => !!n && r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2
  const getCell = (r: number, c: number): SheetCell => rows[r]?.cells[c] ?? {}

  const updR = (nr: SheetRow[]) => onChange({ ...table, rows: nr })

  const patchCell = (r: number, c: number, patch: Partial<SheetCell>) =>
    updR(rows.map((row, ri) => ri !== r ? row : {
      ...row, cells: row.cells.map((cell, ci) => ci !== c ? cell : { ...cell, ...patch }),
    }))

  // Apply a marks key to a whole column: header row(s) get the label text, _isDataRow gets the field.
  const applyMarksKey = (col: number, keyValue: string) => {
    // Guard: reject if another column already uses this key
    const dataRow = rows.find(r => r._isDataRow)
    if (dataRow) {
      const conflictIdx = dataRow.cells.findIndex((cell, ci) => ci !== col && cell.field === keyValue)
      if (conflictIdx >= 0) {
        setPickerError(`Key already used in column ${conflictIdx + 1}`)
        return
      }
    }
    setPickerError(null)
    const option = SHEET_FIELD_OPTIONS.find(o => o.value === keyValue)
    const label  = option?.label ?? keyValue.replace(/^m:/, '')
    const dataIdx = rows.findIndex(r => r._isDataRow)
    // Sample header style from a sibling cell in the row just above the data
    // row — that's the real header row even when a full-width title banner
    // sits above it (e.g. the Ledger's term strip).
    const headerRowRef = dataIdx > 0 ? rows[dataIdx - 1] : null
    const siblingHdrCell = headerRowRef?.cells.find((c, ci) => ci !== col && c.bgColor)
    const inheritedHdr = siblingHdrCell
      ? { bgColor: siblingHdrCell.bgColor, textColor: siblingHdrCell.textColor, bold: siblingHdrCell.bold }
      : {}
    updR(rows.map((row, ri) => ({
      ...row,
      cells: row.cells.map((cell, ci) => {
        if (ci !== col || cell._consumed) return cell
        if (row._isDataRow) return { ...cell, field: keyValue || undefined, text: undefined }
        // Only single-span cells take the column label — a merged cell above
        // the data row (title banner) spans many columns and must keep its
        // own content.
        if ((dataIdx < 0 || ri < dataIdx) && (cell.colSpan ?? 1) === 1) return { ...cell, text: label, field: undefined, ...inheritedHdr }
        return cell
      }),
    })))
    setPickerCol(null)
    setPickerAnchorRect(null)
  }

  const startEdit = (r: number, c: number, anchorEl?: Element) => {
    if (marksKeyMode) {
      setPickerCol(c)
      setPickerError(null)
      if (anchorEl) setPickerAnchorRect(anchorEl.getBoundingClientRect())
      return
    }
    const cell = getCell(r, c)
    if (cell._consumed || cell.field) return
    setEditPos({ r, c }); setEditVal(cell.text ?? '')
  }

  const commitEdit = () => {
    if (!editPos) return
    patchCell(editPos.r, editPos.c, { text: editVal })
    setEditPos(null); setEditVal('')
  }

  const onCellDown = (r: number, c: number, e: React.MouseEvent) => {
    if (pickerCol !== null && pickerCol !== c) setPickerCol(null)
    if (editPos) commitEdit()
    e.preventDefault()
    onFocusGained?.()
    ctx?.onFocus(table, onChangeRef.current)
    drag.current = { r, c }
    const newSel = e.shiftKey && sel ? { ...sel, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c }
    setSel(newSel)
  }

  const onCellEnter = (r: number, c: number, e: React.MouseEvent) => {
    if (e.buttons === 1 && drag.current)
      setSel({ r1: drag.current.r, c1: drag.current.c, r2: r, c2: c })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (pickerCol !== null) { if (e.key === 'Escape') setPickerCol(null); return }
    if (editPos) return
    if (!n) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onChange(applyPatch(table, n, { text: undefined, field: undefined }))
    }
    if (e.key === 'Enter') { e.preventDefault(); startEdit(n.r1, n.c1) }
    if (e.key.startsWith('Arrow') && !e.shiftKey) {
      e.preventDefault()
      const dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const nr = Math.max(0, Math.min(rows.length - 1, n.r1 + dr))
      const nc = Math.max(0, Math.min(colCount - 1, n.c1 + dc))
      setSel({ r1: nr, c1: nc, r2: nr, c2: nc })
    }
  }

  return (
    <div tabIndex={0} onKeyDown={onKeyDown} style={{ outline: 'none' }}>
      <div style={{ overflowX: 'auto' }} onMouseLeave={() => { drag.current = null }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `max(100%, ${colCount * (table.colWidths ? Math.max(...table.colWidths) : 80)}px)`, width: '100%' }}
          onMouseUp={() => { drag.current = null }}>
          <colgroup>
            {Array.from({ length: colCount }, (_, ci) => (
              <col key={ci} style={{ minWidth: table.colWidths?.[ci] ?? 60 }} />
            ))}
          </colgroup>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id}>
                {row.cells.map((cell, ci) => {
                  if (cell._consumed) return null
                  const selected      = inSel(ri, ci)
                  const isEditing     = editPos?.r === ri && editPos?.c === ci
                  const isPickerOpen  = marksKeyMode && pickerCol === ci
                  const displayVal = cell.field
                    ? (resolveField ? resolveField(cell.field) : `[${cell.field}]`)
                    : (cell.text ?? '')

                  return (
                    <td key={ci} colSpan={cell.colSpan ?? 1} rowSpan={cell.rowSpan ?? 1}
                      style={{
                        border: `1px solid ${selected || isPickerOpen ? color : '#d1d5db'}`,
                        outline: (selected || isPickerOpen) ? `2px solid ${color}` : 'none',
                        outlineOffset: -2, padding: 0,
                        backgroundColor: cell.bgColor ?? 'transparent',
                        cursor: marksKeyMode ? 'pointer' : 'cell',
                        verticalAlign: 'middle', position: 'relative',
                      }}
                      onMouseDown={e => onCellDown(ri, ci, e)}
                      onMouseEnter={e => onCellEnter(ri, ci, e)}
                      onDoubleClick={e => startEdit(ri, ci, e.currentTarget)}>
                      {isEditing ? (
                        <input autoFocus value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
                            if (e.key === 'Escape') { setEditPos(null); setEditVal('') }
                            if (e.key === 'Tab')    { e.preventDefault(); commitEdit() }
                          }}
                          style={{
                            display: 'block', width: '100%', boxSizing: 'border-box',
                            border: 'none', outline: 'none', background: 'rgba(59,130,246,0.04)',
                            padding: '2px 4px', fontSize: cell.fontSize ?? 10,
                            fontWeight: cell.bold ? 'bold' : 'normal',
                            fontStyle: cell.italic ? 'italic' : 'normal',
                            textAlign: cell.align ?? 'left',
                            color: cell.textColor ?? 'inherit',
                          }} />
                      ) : (
                        <div style={{
                          padding: '2px 4px', minHeight: 22,
                          fontSize: cell.fontSize ?? 10,
                          fontWeight: cell.bold ? 'bold' : 'normal',
                          fontStyle: cell.italic ? 'italic' : 'normal',
                          textDecoration: cell.underline ? 'underline' : 'none',
                          textAlign: cell.align ?? 'left',
                          color: cell.textColor ?? (cell.field ? color : 'inherit'),
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {cell.field && !resolveField
                            ? <em style={{ fontSize: 8, color: cell.textColor ?? color, opacity: 0.8, fontStyle: 'normal' }}>[{cell.field}]</em>
                            : displayVal}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 2, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>
          {marksKeyMode
            ? 'Dbl-click a cell to set its key or delete the column'
            : 'Click to select · Drag / Shift+click for range · Dbl-click to edit · Del to clear · Arrows to navigate'}
        </span>
        {marksKeyMode && (
          <button
            onMouseDown={e => {
              e.preventDefault()
              const lastColSel: SheetRange = { r1: 0, c1: colCount - 1, r2: rows.length - 1, c2: colCount - 1 }
              const { table: inserted } = applyInsertCol(table, lastColSel, true)
              const newColIdx = colCount
              const dataIdx   = inserted.rows.findIndex(r => r._isDataRow)
              // Inherit header style (bgColor, textColor, bold) from a sibling
              // cell in the row just above the data row — the real header row,
              // even when a full-width title banner sits above it.
              const hdrRowIdx = dataIdx - 1
              const hdrRow    = hdrRowIdx >= 0 ? inserted.rows[hdrRowIdx] : null
              const sib       = hdrRow?.cells.find((c, ci) => ci !== newColIdx && c.bgColor)
              const newTable  = sib ? {
                ...inserted,
                rows: inserted.rows.map((row, ri) =>
                  ri !== hdrRowIdx ? row : {
                    ...row,
                    cells: row.cells.map((cell, ci) =>
                      ci !== newColIdx ? cell
                        : { ...cell, bgColor: sib.bgColor, textColor: sib.textColor, bold: sib.bold }
                    ),
                  }
                ),
              } : inserted
              onChange(newTable)
              // Open key picker for the newly inserted column (now at index colCount)
              setPickerCol(colCount)
              setPickerError(null)
              setPickerAnchorRect(e.currentTarget.getBoundingClientRect())
            }}
            style={{
              fontSize: 9, padding: '2px 8px', border: `1px solid ${color}`,
              borderRadius: 3, background: '#fff', color, cursor: 'pointer', fontWeight: 600,
            }}>
            ＋ Add column
          </button>
        )}
      </div>

      {/* Portal-based key picker — rendered on document.body so it escapes overflow:auto clipping */}
      {marksKeyMode && pickerCol !== null && pickerAnchorRect && typeof document !== 'undefined' && createPortal(
        <MarksPicker
          anchorRect={pickerAnchorRect}
          col={pickerCol}
          currentKey={rows.find(r => r._isDataRow)?.cells[pickerCol]?.field ?? ''}
          color={color}
          error={pickerError}
          options={marksKeyOptions ?? SHEET_FIELD_OPTIONS.filter(o => o.marks)}
          onPick={key => applyMarksKey(pickerCol, key)}
          onDelete={() => {
            const col = pickerCol
            setPickerCol(null); setPickerAnchorRect(null); setPickerError(null)
            onChange(applyDeleteCols(table, { r1: 0, c1: col, r2: rows.length - 1, c2: col }))
          }}
          onClose={() => { setPickerCol(null); setPickerAnchorRect(null); setPickerError(null) }}
        />,
        document.body,
      )}
    </div>
  )
}

// ── SpreadsheetEditor ─────────────────────────────────────────────────────────
// Convenience: toolbar + grid in one component (for standalone usage).
export interface SpreadsheetEditorProps {
  table:         SpreadsheetTable
  onChange:      (t: SpreadsheetTable) => void
  color:         string
  resolveField?: (field: string) => string
}

export function SpreadsheetEditor({ table, onChange, color, resolveField }: SpreadsheetEditorProps) {
  const [sel, setSel] = useState<SheetRange | null>(null)
  return (
    <div style={{ fontSize: 10 }}>
      <SpreadsheetToolbar table={table} sel={sel} onChange={onChange} onSelChange={setSel} color={color} />
      <div style={{ marginTop: 3 }}>
        <SpreadsheetGrid table={table} onChange={onChange} color={color} resolveField={resolveField}
          sel={sel} onSelChange={setSel} />
      </div>
    </div>
  )
}
