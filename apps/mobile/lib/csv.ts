import { Share } from 'react-native'

// Lightweight CSV export for mobile. We don't pull in expo-file-system/expo-sharing,
// so the share sheet gets the CSV as text (paste into email, Notes, Sheets, etc.).
// The data is whatever the screen already loaded, which the API scopes to the
// admin's own school — an export can never reach another tenant's data.

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
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(',')).join('\n')
  return header + '\n' + body
}

/** Build the CSV and open the OS share sheet with it as the message. */
export async function shareCsv<T>(title: string, rows: T[], columns: CsvColumn<T>[]): Promise<void> {
  const csv = buildCsv(rows, columns)
  await Share.share({ title, message: csv })
}
