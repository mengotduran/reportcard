import ExcelJS from 'exceljs'

export interface ParsedStudentRow {
  row: number
  name: string
  classLevel: string
  gender: 'Male' | 'Female'
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  matricule?: string
  // Set to true for university Level 2 students that have no existing match —
  // they are new direct entrants and pay only the Level 2 class fee.
  directLevel2Entry?: boolean
  // Most students transferring in have already paid some part of the class
  // fee — feePaid is optional, recorded as one FeePayment if present (see
  // commitStudentImport in student.controller.ts). paymentDate falls back to
  // today if blank/unparseable; feePaid itself must parse if the cell isn't
  // empty (a typo in a financial figure shouldn't be silently swallowed).
  feePaid?: number
  paymentDate?: string
}

export interface CarryOverRow {
  row: number
  name: string
  classLevel: string
  matricule?: string
  // 'matricule' means an exact studentId match was found; 'name' means only a
  // name match was found (lower confidence — admin should verify in preview).
  matchType: 'matricule' | 'name'
}

export interface ImportRowError {
  row: number
  reason: string
}

export interface ImportPreviewResult {
  valid: ParsedStudentRow[]
  errors: ImportRowError[]
  // University Level 2 students whose name or matricule matched an existing
  // student — they are already in the system and will NOT be re-created.
  carryOvers?: CarryOverRow[]
  // Set instead of per-row errors when the file's headers don't match any
  // known column at all — one clear message beats N identical row errors.
  headerError?: string
}

// English-as-key aliases, normalized (lowercase, alphanumeric only) so "Guardian Phone",
// "guardian_phone", and "GuardianPhone" all match the same alias.
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'fullname', 'studentname', 'pupilname'],
  // "department" used to be an alias meaning THIS field (there was no separate
  // Department column) — now Department is its own column, so this only takes
  // Class (secondary) / Level (university) header spellings.
  classLevel: ['class', 'classlevel', 'level'],
  department: ['department', 'dept'],
  gender: ['gender', 'sex'],
  guardianName: ['guardianname', 'parentname', 'guardian', 'parent'],
  guardianPhone: ['guardianphone', 'parentphone', 'phone', 'guardiancontact', 'contact', 'phonenumber'],
  guardianEmail: ['guardianemail', 'parentemail', 'email'],
  matricule: ['matricule', 'studentid', 'matric', 'studentmatricule', 'matriculeno', 'idnumber', 'registrationno'],
  feePaid: ['feepaid', 'fee', 'amountpaid', 'paid', 'feesalreadypaid', 'feepaidxaf'],
  paymentDate: ['paymentdate', 'datepaid', 'paiddate', 'feedate'],
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const normalizeName = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

export type ImportSchoolType = 'PRIMARY' | 'SECONDARY' | 'UNIVERSITY'
export interface ImportClassInfo { name: string; departmentId: string | null }
export interface ImportDepartmentInfo { id: string; name: string; isDefault: boolean }

// Secondary class-name convention: bare ("Form 1") for the default department,
// suffixed ("Form 1 (Technical)") for any other. Mirrors stripDeptSuffix, duplicated
// the same way across the web app's classes/students/teachers pages — no shared
// module between the API and web app to hold this instead.
function stripDeptSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}" (Level 3). Mirrors deptFromClassName/levelFromClassName in
// apps/web/app/(dashboard)/classes/page.tsx — universities have no real Department
// table row, the department (programme) lives only in the class name string.
function univDeptFromClassName(name: string): string {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}
function univLevelFromClassName(name: string): 'Level 1' | 'Level 2' | 'Level 3' | '' {
  if (/ - Level 1$/i.test(name)) return 'Level 1'
  if (/ - Level 2$/i.test(name)) return 'Level 2'
  if (name.startsWith('Degree ') || / - Level 3$/i.test(name)) return 'Level 3'
  return ''
}
function normalizeLevelInput(raw: string): 'Level 1' | 'Level 2' | 'Level 3' | null {
  const n = normalize(raw)
  if (n === 'level1' || n === '1' || n === 'l1') return 'Level 1'
  if (n === 'level2' || n === '2' || n === 'l2') return 'Level 2'
  if (n === 'level3' || n === '3' || n === 'l3') return 'Level 3'
  return null
}

// Resolves a row's Department + Class/Level cells to a real ClassLevel.name, or a
// row-error reason. School-type-specific because secondary departments are real
// Department rows while university departments are a name-string convention only.
function makeClassResolver(
  schoolType: ImportSchoolType,
  classes: ImportClassInfo[],
  departments: ImportDepartmentInfo[],
): (deptRaw: string, classOrLevelRaw: string) => { name: string } | { error: string } {
  if (schoolType === 'SECONDARY') {
    const deptByNorm = new Map(departments.map((d) => [normalize(d.name), d]))
    const classByDeptAndBase = new Map(
      classes.map((c) => [`${c.departmentId ?? ''}|${normalize(stripDeptSuffix(c.name))}`, c.name])
    )
    return (deptRaw, classRaw) => {
      const dept = deptByNorm.get(normalize(deptRaw))
      if (!dept) return { error: `Department "${deptRaw}" not found` }
      const full = classByDeptAndBase.get(`${dept.id}|${normalize(classRaw)}`)
      if (!full) return { error: `Class "${classRaw}" not found in department "${dept.name}"` }
      return { name: full }
    }
  }
  if (schoolType === 'UNIVERSITY') {
    const classByDeptAndLevel = new Map<string, string>()
    for (const c of classes) {
      const level = univLevelFromClassName(c.name)
      if (!level) continue
      classByDeptAndLevel.set(`${normalize(univDeptFromClassName(c.name))}|${level}`, c.name)
    }
    return (deptRaw, levelRaw) => {
      const level = normalizeLevelInput(levelRaw)
      if (!level) return { error: `Level must be Level 1, Level 2, or Level 3 (got "${levelRaw}")` }
      const full = classByDeptAndLevel.get(`${normalize(deptRaw)}|${level}`)
      if (!full) return { error: `No ${level} class found for department "${deptRaw}"` }
      return { name: full }
    }
  }
  // PRIMARY — unchanged single-column matching, no department concept.
  const classByNorm = new Map(classes.map((c) => [normalize(c.name), c.name]))
  return (_deptRaw, classRaw) => {
    const full = classByNorm.get(normalize(classRaw))
    if (!full) return { error: `Class "${classRaw}" does not match any defined class` }
    return { name: full }
  }
}

function fieldForHeader(header: string): string | null {
  const norm = normalize(header)
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(norm)) return field
  }
  return null
}

interface RawRow { rowNumber: number; data: Record<string, string> }

// Dependency-free CSV tokenizer — handles quoted fields (commas/newlines inside
// quotes, doubled "" for an escaped quote). Mirrors this repo's existing
// preference for small hand-rolled parsers over a dependency (see lib/zip.ts).
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += ch; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

function parseCsv(text: string): RawRow[] {
  const lines = splitCsvRows(text)
  if (lines.length === 0) return []
  const headers = lines[0].map((h) => h.trim())
  const rows: RawRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]
    const data: Record<string, string> = {}
    let hasContent = false
    headers.forEach((h, idx) => {
      const value = (cells[idx] ?? '').trim()
      if (h) data[h] = value
      if (value) hasContent = true
    })
    if (hasContent) rows.push({ rowNumber: i + 1, data })
  }
  return rows
}

async function parseXlsx(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook()
  // Cast: exceljs's bundled Buffer type and this project's @types/node Buffer
  // resolve structurally incompatible generics — a type-checker version skew,
  // not an actual runtime issue (a real Buffer is passed either way).
  await workbook.xlsx.load(buffer as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim()
  })

  const cellText = (value: ExcelJS.CellValue): string => {
    if (value == null) return ''
    if (typeof value === 'object' && 'text' in (value as any)) return String((value as any).text)
    if (typeof value === 'object' && 'richText' in (value as any)) return (value as any).richText.map((r: any) => r.text).join('')
    return String(value)
  }

  const rows: RawRow[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const data: Record<string, string> = {}
    let hasContent = false
    headers.forEach((h, i) => {
      if (!h) return
      const text = cellText(row.getCell(i + 1).value).trim()
      data[h] = text
      if (text) hasContent = true
    })
    if (hasContent) rows.push({ rowNumber, data })
  })
  return rows
}

// Validates+normalizes one uploaded file against the school's actual class
// list. Does NOT write to the database — see commitStudentImport in
// student.controller.ts for that (separate step so nothing is created until
// the admin reviews and confirms the preview).
//
// existingStudents: pass the school's current student list when importing for
// a university. For each Level 2 row, the function checks if the student is
// already in the system (carry-over from Level 1) by matching matricule first
// then name. Carry-overs go into the returned carryOvers array and are NOT
// included in valid — they will not be re-created on commit.
export async function previewStudentRows(
  buffer: Buffer,
  filename: string,
  schoolType: ImportSchoolType,
  classes: ImportClassInfo[],
  departments: ImportDepartmentInfo[],
  existingStudents?: { name: string; studentId: string }[],
): Promise<ImportPreviewResult> {
  const ext = filename.toLowerCase().split('.').pop()
  const rawRows = ext === 'csv' ? parseCsv(buffer.toString('utf-8')) : await parseXlsx(buffer)

  const allHeaders = new Set<string>()
  for (const r of rawRows) for (const h of Object.keys(r.data)) allHeaders.add(h)
  const fieldByHeader = new Map<string, string>()
  for (const h of allHeaders) {
    const field = fieldForHeader(h)
    if (field) fieldByHeader.set(h, field)
  }
  const mappedFields = new Set(fieldByHeader.values())
  if (!mappedFields.has('name') || !mappedFields.has('classLevel') || !mappedFields.has('gender')) {
    return { valid: [], errors: [], headerError: `Could not find Name, ${schoolType === 'UNIVERSITY' ? 'Level' : 'Class'}, and Gender columns in this file. Download the template and use the same column headers.` }
  }
  if (schoolType !== 'PRIMARY' && !mappedFields.has('department')) {
    return { valid: [], errors: [], headerError: 'Could not find a Department column in this file. Download the template and use the same column headers.' }
  }

  const resolveClass = makeClassResolver(schoolType, classes, departments)

  const valid: ParsedStudentRow[] = []
  const errors: ImportRowError[] = []
  const carryOvers: CarryOverRow[] = []

  for (const { rowNumber, data } of rawRows) {
    const mapped: Record<string, string> = {}
    for (const [header, value] of Object.entries(data)) {
      const field = fieldByHeader.get(header)
      if (field) mapped[field] = value
    }

    const name = (mapped.name || '').trim()
    const deptRaw = (mapped.department || '').trim()
    const classRaw = (mapped.classLevel || '').trim()
    const genderRaw = (mapped.gender || '').trim().toLowerCase()

    if (!name) { errors.push({ row: rowNumber, reason: 'Missing name' }); continue }
    if (schoolType !== 'PRIMARY' && !deptRaw) { errors.push({ row: rowNumber, reason: 'Missing department' }); continue }
    if (!classRaw) { errors.push({ row: rowNumber, reason: schoolType === 'UNIVERSITY' ? 'Missing level' : 'Missing class' }); continue }
    const resolved = resolveClass(deptRaw, classRaw)
    if ('error' in resolved) { errors.push({ row: rowNumber, reason: resolved.error }); continue }
    const matchedClass = resolved.name

    let gender: 'Male' | 'Female' | null = null
    if (genderRaw === 'male' || genderRaw === 'm') gender = 'Male'
    else if (genderRaw === 'female' || genderRaw === 'f') gender = 'Female'
    if (!gender) { errors.push({ row: rowNumber, reason: `Gender must be Male or Female (got "${mapped.gender || ''}")` }); continue }

    // A typo in a financial figure shouldn't be silently dropped — error the
    // row if the cell has *something* that isn't a valid non-negative number.
    // An empty cell is fine (no payment to record).
    const feePaidRaw = (mapped.feePaid || '').trim()
    let feePaid: number | undefined
    if (feePaidRaw) {
      const amt = Number(feePaidRaw.replace(/[, ]/g, ''))
      if (!Number.isFinite(amt) || amt < 0) { errors.push({ row: rowNumber, reason: `Fee Paid must be a number (got "${feePaidRaw}")` }); continue }
      if (amt > 0) feePaid = Math.round(amt)
    }

    // Payment date is best-effort — fall back to "today" at commit time
    // rather than failing the row over a date format glitch.
    const paymentDateRaw = (mapped.paymentDate || '').trim()
    let paymentDate: string | undefined
    if (paymentDateRaw && feePaid) {
      const d = new Date(paymentDateRaw)
      if (!isNaN(d.getTime())) paymentDate = d.toISOString()
    }

    const matricule = mapped.matricule?.trim() || undefined

    // For university Level 2 classes: check if this student already exists
    // in the school (carry-over from Level 1). Matricule match is checked
    // first (exact, case-insensitive) then name match (normalized whitespace
    // and case). Carry-overs are already in the system — they are NOT added
    // to valid and will not be re-created during commit.
    const isLevel2 = /- level 2$/i.test(matchedClass)
    if (isLevel2 && existingStudents && existingStudents.length > 0) {
      let matchType: 'matricule' | 'name' | null = null

      if (matricule) {
        const normMatricule = matricule.toLowerCase()
        if (existingStudents.some((s) => s.studentId.toLowerCase() === normMatricule)) {
          matchType = 'matricule'
        }
      }

      if (!matchType) {
        const normName = normalizeName(name)
        if (existingStudents.some((s) => normalizeName(s.name) === normName)) {
          matchType = 'name'
        }
      }

      if (matchType) {
        carryOvers.push({ row: rowNumber, name, classLevel: matchedClass, matricule, matchType })
        continue
      }

      // No match — new student entering directly at Level 2
      valid.push({
        row: rowNumber, name, classLevel: matchedClass, gender, matricule,
        guardianName: mapped.guardianName?.trim() || undefined,
        guardianPhone: mapped.guardianPhone?.trim() || undefined,
        guardianEmail: mapped.guardianEmail?.trim() || undefined,
        feePaid, paymentDate, directLevel2Entry: true,
      })
      continue
    }

    valid.push({
      row: rowNumber, name, classLevel: matchedClass, gender, matricule,
      guardianName: mapped.guardianName?.trim() || undefined,
      guardianPhone: mapped.guardianPhone?.trim() || undefined,
      guardianEmail: mapped.guardianEmail?.trim() || undefined,
      feePaid, paymentDate,
    })
  }

  return { valid, errors, carryOvers: carryOvers.length > 0 ? carryOvers : undefined }
}

// Builds the downloadable .xlsx template — headers + one example row + a reference
// sheet listing every real Department + Class/Level combination the school actually
// has (secondary/university), or every real class name (primary), so whoever fills
// it in knows exactly what's accepted rather than guessing a spelling.
export async function buildImportTemplate(
  schoolType: ImportSchoolType,
  classes: ImportClassInfo[],
  departments: ImportDepartmentInfo[],
): Promise<Buffer> {
  const isUniversity = schoolType === 'UNIVERSITY'
  const isSecondary = schoolType === 'SECONDARY'
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Students')

  const columns: Partial<ExcelJS.Column>[] = []
  if (isUniversity) {
    columns.push({ header: 'Matricule (optional)', key: 'matricule', width: 22 })
  }
  columns.push({ header: 'Name', key: 'name', width: 28 })
  if (isSecondary) {
    columns.push(
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Class', key: 'classLevel', width: 20 },
    )
  } else if (isUniversity) {
    columns.push(
      { header: 'Department', key: 'department', width: 24 },
      { header: 'Level', key: 'classLevel', width: 14 },
    )
  } else {
    columns.push({ header: 'Class', key: 'classLevel', width: 28 })
  }
  columns.push(
    { header: 'Gender', key: 'gender', width: 12 },
    { header: 'Guardian Name', key: 'guardianName', width: 24 },
    { header: 'Guardian Phone', key: 'guardianPhone', width: 18 },
    { header: 'Guardian Email', key: 'guardianEmail', width: 24 },
    { header: 'Fee Paid', key: 'feePaid', width: 14 },
    { header: 'Payment Date', key: 'paymentDate', width: 16 },
  )
  sheet.columns = columns

  const firstClass = classes[0]
  const exampleRow: Record<string, any> = {
    name: 'Nguemo Alice',
    gender: 'Female',
    guardianName: 'Nguemo Jean',
    guardianPhone: '677000000',
    guardianEmail: 'guardian@email.com',
    feePaid: 50000,
    paymentDate: '2026-01-15',
  }
  if (isSecondary) {
    const deptOfFirst = departments.find((d) => d.id === firstClass?.departmentId)
    exampleRow.department = deptOfFirst?.name ?? departments[0]?.name ?? 'Grammar'
    exampleRow.classLevel = firstClass ? stripDeptSuffix(firstClass.name) : 'Form 1'
  } else if (isUniversity) {
    exampleRow.department = firstClass ? univDeptFromClassName(firstClass.name) : 'Computer Science'
    exampleRow.classLevel = (firstClass && univLevelFromClassName(firstClass.name)) || 'Level 1'
  } else {
    exampleRow.classLevel = firstClass?.name ?? 'Form 1'
  }
  if (isUniversity) exampleRow.matricule = ''
  sheet.addRow(exampleRow)
  sheet.getRow(1).font = { bold: true }

  if (isUniversity) {
    const noteSheet = workbook.addWorksheet('Notes')
    noteSheet.columns = [{ header: 'Level 2 import note', key: 'note', width: 80 }]
    noteSheet.getRow(1).font = { bold: true }
    noteSheet.addRow({ note: 'For Level 2 classes: include the Matricule so the system can detect carry-over students.' })
    noteSheet.addRow({ note: 'Students whose matricule (or name) matches an existing record are carry-overs and will NOT be re-created.' })
    noteSheet.addRow({ note: 'Students with no match are treated as new direct Level 2 entrants and are charged the Level 2 class fee only.' })
  }

  if (isSecondary) {
    const rows = classes
      .map((c) => ({ department: departments.find((d) => d.id === c.departmentId)?.name ?? '', classLevel: stripDeptSuffix(c.name) }))
      .filter((r) => r.department)
    if (rows.length > 0) {
      const refSheet = workbook.addWorksheet('Valid Departments & Classes')
      refSheet.columns = [
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Class', key: 'classLevel', width: 20 },
      ]
      refSheet.getRow(1).font = { bold: true }
      for (const r of rows) refSheet.addRow(r)
    }
  } else if (isUniversity) {
    const rows = classes
      .map((c) => ({ department: univDeptFromClassName(c.name), classLevel: univLevelFromClassName(c.name) }))
      .filter((r) => r.classLevel)
    if (rows.length > 0) {
      const refSheet = workbook.addWorksheet('Valid Departments & Levels')
      refSheet.columns = [
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Level', key: 'classLevel', width: 14 },
      ]
      refSheet.getRow(1).font = { bold: true }
      for (const r of rows) refSheet.addRow(r)
    }
  } else if (classes.length > 0) {
    const classSheet = workbook.addWorksheet('Valid Classes')
    classSheet.columns = [{ header: 'Use exactly this spelling in the Class column', key: 'name', width: 40 }]
    classSheet.getRow(1).font = { bold: true }
    for (const c of classes) classSheet.addRow({ name: c.name })
  }

  const buf = await workbook.xlsx.writeBuffer()
  return Buffer.from(buf)
}
