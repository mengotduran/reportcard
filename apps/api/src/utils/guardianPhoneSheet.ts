import ExcelJS from 'exceljs'
import { normalizeGuardianPhone, formatPhoneForDisplay } from './phone'
import { parseSpreadsheet } from './studentImport'

// Filling guardian phone numbers in for students who are ALREADY on the roster.
//
// The student importer next door only ever creates, so it cannot be used for this: a school
// that has been running for years has a thousand students and no phone numbers, and re-
// uploading the roster would duplicate every one of them. This is the other half — download
// who is missing a number, let the school fill one column, upload it back.
//
// Rows are matched on matricule, never on name. Two students called "Achu Ako" is ordinary
// in a school this size, and writing a phone number onto the wrong child's record is exactly
// the kind of quiet error nobody notices until a parent sees somebody else's report card.

export const MATRICULE_HEADER = 'Matricule'
export const PHONE_HEADER = 'Guardian Phone'

export interface PhoneSheetStudent {
  studentId: string
  name: string
  classLevel: string
  guardianName: string | null
  guardianPhone: string | null
}

/** Why this student's stored number cannot be used, or null when it is fine. */
export function phoneProblemOf(guardianPhone: string | null | undefined): string | null {
  if (!guardianPhone || !guardianPhone.trim()) return 'No number on record'
  const result = normalizeGuardianPhone(guardianPhone)
  return 'error' in result ? result.error : null
}

/**
 * The fill-in workbook. The current value travels with each row (not just the blanks) so
 * whoever fills it in can see what is already there and correct it, and the Problem column
 * says why a number that looks fine was rejected — "expected 9 digits, got 8" is the
 * difference between a school fixing 40 rows and a school giving up.
 */
export async function buildGuardianPhoneSheet(students: PhoneSheetStudent[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Guardian Phones')

  sheet.columns = [
    { header: MATRICULE_HEADER, key: 'matricule', width: 18 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Class', key: 'classLevel', width: 20 },
    { header: 'Guardian Name', key: 'guardianName', width: 24 },
    { header: PHONE_HEADER, key: 'guardianPhone', width: 20 },
    { header: 'Problem', key: 'problem', width: 46 },
  ]

  for (const s of students) {
    const problem = phoneProblemOf(s.guardianPhone)
    sheet.addRow({
      matricule: s.studentId,
      name: s.name,
      classLevel: s.classLevel,
      guardianName: s.guardianName ?? '',
      // A number that already normalises is shown in its readable form; a broken one is
      // shown exactly as stored, because that is what has to be recognised and replaced.
      guardianPhone: problem ? (s.guardianPhone ?? '') : formatPhoneForDisplay(s.guardianPhone),
      problem: problem ?? '',
    })
  }

  sheet.getRow(1).font = { bold: true }
  // Text, not "general": Excel helpfully turns 677123456 into 6.77123E+08 and drops the
  // leading zero off 0677123456, and either one comes back as a number nobody can dial.
  sheet.getColumn('guardianPhone').numFmt = '@'

  const notes = workbook.addWorksheet('How to fill this in')
  notes.columns = [{ header: 'Instructions', key: 'note', width: 96 }]
  notes.getRow(1).font = { bold: true }
  for (const note of [
    'Type each guardian\'s phone number in the "Guardian Phone" column, then upload this file back.',
    'A Cameroon number can be typed however you like: 677123456, 677 12 34 56, 0677123456 or +237 677 123 456.',
    'For a number outside Cameroon, start it with + and the country code, e.g. +234 802 123 4567.',
    'Do not change the Matricule column. It is how each row is matched to the right student.',
    'Leave a row blank to skip it. Nothing is changed for rows you do not fill in.',
    'Adding or removing rows is fine. Only the rows in the file are looked at.',
  ]) notes.addRow({ note })

  const ab = await workbook.xlsx.writeBuffer()
  return Buffer.from(ab)
}

export interface PhoneImportRow {
  row: number
  matricule: string
  studentId: string
  name: string
  /** The canonical number this row would write. */
  e164: string
  display: string
  /** What is stored today, for the "no change" case. */
  current: string | null
}

export interface PhoneImportError { row: number; matricule: string; reason: string }

export interface PhoneImportResult {
  changes: PhoneImportRow[]
  unchanged: number
  skipped: number
  errors: PhoneImportError[]
  headerError?: string
}

const normalizeHeader = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const MATRICULE_ALIASES = ['matricule', 'matriculenumber', 'studentid', 'id', 'registrationnumber', 'regno']
const PHONE_ALIASES = ['guardianphone', 'phone', 'phonenumber', 'parentphone', 'contact', 'telephone', 'tel']

/**
 * Reads an uploaded sheet and works out what it would change. Writes nothing — the caller
 * runs this once to show the admin a preview and again to apply it, so a file with the
 * matricule column shifted by one cannot silently rewrite a thousand records.
 */
export async function readGuardianPhoneSheet(
  buffer: Buffer,
  filename: string,
  students: { id: string; studentId: string; name: string; guardianPhone: string | null }[],
): Promise<PhoneImportResult> {
  const rawRows = await parseSpreadsheet(buffer, filename)

  const headers = new Set<string>()
  for (const r of rawRows) for (const h of Object.keys(r.data)) headers.add(h)
  const findHeader = (aliases: string[]) =>
    [...headers].find((h) => aliases.includes(normalizeHeader(h))) ?? null
  const matriculeHeader = findHeader(MATRICULE_ALIASES)
  const phoneHeader = findHeader(PHONE_ALIASES)

  if (!matriculeHeader || !phoneHeader) {
    return {
      changes: [], unchanged: 0, skipped: 0, errors: [],
      headerError: `Could not find a "${MATRICULE_HEADER}" column and a "${PHONE_HEADER}" column in this file. Download the list again and fill in that sheet.`,
    }
  }

  const byMatricule = new Map(students.map((s) => [s.studentId.trim().toLowerCase(), s]))
  const changes: PhoneImportRow[] = []
  const errors: PhoneImportError[] = []
  // Guards against one student appearing twice in the file with two different numbers, which
  // would otherwise apply whichever row happened to come last.
  const seen = new Map<string, number>()
  let unchanged = 0
  let skipped = 0

  for (const { rowNumber, data } of rawRows) {
    const matricule = String(data[matriculeHeader] ?? '').trim()
    const typed = String(data[phoneHeader] ?? '').trim()

    if (!matricule && !typed) { skipped++; continue }
    if (!matricule) { errors.push({ row: rowNumber, matricule: '', reason: 'This row has a phone number but no matricule, so there is no way to tell whose it is' }); continue }
    // An untouched row is the normal case: the school fills in the ones it knows.
    if (!typed) { skipped++; continue }

    const student = byMatricule.get(matricule.toLowerCase())
    if (!student) { errors.push({ row: rowNumber, matricule, reason: `No student in this school has the matricule "${matricule}"` }); continue }

    const firstRow = seen.get(student.id)
    if (firstRow != null) { errors.push({ row: rowNumber, matricule, reason: `${student.name} also appears on row ${firstRow}. Keep one row per student.` }); continue }

    const phone = normalizeGuardianPhone(typed)
    if ('error' in phone) { errors.push({ row: rowNumber, matricule, reason: phone.error }); continue }

    seen.set(student.id, rowNumber)
    if (phone.e164 === student.guardianPhone) { unchanged++; continue }

    changes.push({
      row: rowNumber, matricule, studentId: student.id, name: student.name,
      e164: phone.e164, display: formatPhoneForDisplay(phone.e164), current: student.guardianPhone,
    })
  }

  return { changes, unchanged, skipped, errors }
}
