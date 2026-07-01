// Tiny client-side CSV export — no dependency. The data passed in is whatever the
// page already loaded, which is tenant-scoped by the API (every query filters by
// the admin's schoolId), so an export can never reach another school's data.

export interface CsvColumn<T> {
  label: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(',')).join('\r\n')
  // Prepend a UTF-8 BOM so Excel opens accented characters (é, à…) correctly.
  return '﻿' + header + '\r\n' + body
}

/** Save a Blob to disk via a temporary link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Save a ready-made CSV string to disk. */
export function saveCsv(filename: string, content: string): void {
  saveBlob(new Blob([content], { type: 'text/csv;charset=utf-8;' }), filename)
}

/** Build the CSV and trigger a browser download. */
export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  saveCsv(filename, buildCsv(rows, columns))
}

/** e.g. "students-2026-06-22.csv" (or pass ext to get a different extension) */
export function datedFilename(prefix: string, ext = 'csv'): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${ext}`
}
