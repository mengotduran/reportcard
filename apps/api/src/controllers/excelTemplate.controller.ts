import { Response } from 'express'
import ExcelJS from 'exceljs'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

const MAX_TEMPLATES = 10

// ── GPA helpers (mirrors PrintableTranscript client-side logic) ───────────────

function gpForMark(score: number | null, ranges: any[]) {
  if (score == null) return { grade: '—', gradePoint: 0 }
  const sorted = [...ranges].sort((a: any, b: any) => b.minScore - a.minScore)
  const r = sorted.find((x: any) => score >= x.minScore && score <= x.maxScore)
  return { grade: r?.grade ?? 'F', gradePoint: r?.gradePoint ?? 0 }
}

function classLabel(cgpa: number, bands: any[]) {
  const sorted = [...bands].sort((a: any, b: any) => b.min - a.min)
  return sorted.find((b: any) => cgpa >= b.min && cgpa <= b.max)?.label?.toUpperCase() ?? 'FAIL'
}

// ── Excel generation engine ───────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell): string {
  if (cell.value == null) return ''
  if (typeof cell.value === 'string') return cell.value
  if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
    return ((cell.value as any).richText ?? []).map((r: any) => r.text ?? '').join('')
  }
  return String(cell.value)
}

function replaceTags(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => data[key.trim()] ?? `{{${key.trim()}}}`)
}

function fillCell(cell: ExcelJS.Cell, data: Record<string, string>) {
  const t = cellText(cell)
  if (!t.includes('{{')) return
  // Rich text: flatten to plain string with replaced tags
  if (cell.value != null && typeof cell.value === 'object' && 'richText' in cell.value) {
    cell.value = replaceTags(t, data)
    return
  }
  if (typeof cell.value === 'string') {
    cell.value = replaceTags(cell.value, data)
  }
}

interface CourseRow {
  code: string; title: string; credit: string; mark: string
  grade: string; grade_point: string; weighted_point: string
}

function expandCourseBlock(
  ws: ExcelJS.Worksheet,
  startTag: string,
  endTag: string,
  courses: CourseRow[],
) {
  // Find the start and end marker row numbers.
  let startRowNum: number | null = null
  let endRowNum: number | null = null

  ws.eachRow((row, rowNum) => {
    row.eachCell({ includeEmpty: true }, cell => {
      const t = cellText(cell)
      if (t.includes(startTag)) startRowNum = rowNum
      if (t.includes(endTag))   endRowNum   = rowNum
    })
  })

  if (startRowNum == null || endRowNum == null || endRowNum <= startRowNum + 1) return

  const templateRowNum = startRowNum + 1

  // Capture template row data so we can clone it for extra course rows.
  const tRow = ws.getRow(templateRowNum)
  const tHeight = tRow.height
  const tCells: { col: number; value: ExcelJS.CellValue; style: ExcelJS.Style }[] = []
  tRow.eachCell({ includeEmpty: true }, (cell, col) => {
    tCells.push({ col, value: cell.value, style: JSON.parse(JSON.stringify(cell.style)) })
  })

  // Insert (N-1) copies of the template row immediately after it.
  for (let i = 1; i < courses.length; i++) {
    ws.spliceRows(templateRowNum + i, 0, [])
    const nr = ws.getRow(templateRowNum + i)
    nr.height = tHeight
    for (const cd of tCells) {
      const c = nr.getCell(cd.col)
      c.style = JSON.parse(JSON.stringify(cd.style))
      c.value = cd.value
    }
    nr.commit()
  }

  // Fill each course row with real data.
  for (let i = 0; i < courses.length; i++) {
    const row = ws.getRow(templateRowNum + i)
    const tagData: Record<string, string> = {
      code:           courses[i].code,
      title:          courses[i].title,
      credit:         courses[i].credit,
      mark:           courses[i].mark,
      grade:          courses[i].grade,
      grade_point:    courses[i].grade_point,
      weighted_point: courses[i].weighted_point,
    }
    row.eachCell({ includeEmpty: true }, cell => fillCell(cell, tagData))
    row.commit()
  }

  // Delete end marker first (higher row index), then start marker.
  const newEndRowNum = endRowNum + Math.max(0, courses.length - 1)
  ws.spliceRows(newEndRowNum, 1)
  ws.spliceRows(startRowNum, 1)
}

async function buildFilledBuffer(
  templateBytes: Buffer | Uint8Array,
  student: any,
  school: any,
  session: string,
  sem1Entries: any[],
  sem2Entries: any[],
  gradingRanges: any[],
  classificationBands: any[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(templateBytes) as any)

  // Build per-course rows for each semester.
  function makeCourseRows(entries: any[]): CourseRow[] {
    return entries.map(e => {
      const { grade, gradePoint } = gpForMark(e.score, gradingRanges)
      const credit = e.subject.credit ?? 0
      const wp = gradePoint * credit
      return {
        code:           e.subject.code ?? '',
        title:          e.subject.name,
        credit:         String(credit),
        mark:           e.score != null ? String(e.score) : '—',
        grade,
        grade_point:    gradePoint.toFixed(2),
        weighted_point: wp.toFixed(2),
      }
    })
  }

  function semTotals(entries: any[]) {
    let credits = 0, markSum = 0, gpSum = 0, wp = 0
    for (const e of entries) {
      const g = gpForMark(e.score, gradingRanges)
      const cr = e.subject.credit ?? 0
      credits += cr; markSum += e.score ?? 0; gpSum += g.gradePoint; wp += g.gradePoint * cr
    }
    return { credits, markSum, gpSum, wp, gpa: credits > 0 ? wp / credits : 0 }
  }

  const s1c = makeCourseRows(sem1Entries)
  const s2c = makeCourseRows(sem2Entries)
  const s1  = semTotals(sem1Entries)
  const s2  = semTotals(sem2Entries)
  const allCredits = s1.credits + s2.credits
  const cgpa = allCredits > 0 ? (s1.wp + s2.wp) / allCredits : 0

  const n = (v: number, decimals = 1) => v % 1 === 0 ? String(v) : v.toFixed(decimals)

  const fixed: Record<string, string> = {
    student_name:       student.name,
    student_id:         student.studentId,
    program:            student.classLevel,
    session,
    gender:             student.gender ?? '',
    date_of_birth:      student.dateOfBirth ?? '',
    school_name:        school.name,
    academic_year:      session,
    sem1_credit_total:  String(s1.credits),
    sem1_mark_total:    n(s1.markSum),
    sem1_gp_total:      n(s1.gpSum),
    sem1_wp_total:      s1.wp.toFixed(2),
    sem1_gpa:           s1.gpa.toFixed(2),
    sem2_credit_total:  String(s2.credits),
    sem2_mark_total:    n(s2.markSum),
    sem2_gp_total:      n(s2.gpSum),
    sem2_wp_total:      s2.wp.toFixed(2),
    sem2_gpa:           s2.gpa.toFixed(2),
    overall_credits:    String(allCredits),
    cgpa:               cgpa.toFixed(2),
    remark:             classLabel(cgpa, classificationBands),
  }

  for (const ws of wb.worksheets) {
    // Process sem2 block first (further down in the sheet) to avoid index drift
    // when sem1 block is expanded just above it.
    expandCourseBlock(ws, '{{#sem2_courses}}', '{{/sem2_courses}}', s2c)
    expandCourseBlock(ws, '{{#sem1_courses}}', '{{/sem1_courses}}', s1c)

    // Fill all remaining fixed tags.
    ws.eachRow(row => {
      row.eachCell({ includeEmpty: true }, cell => fillCell(cell, fixed))
    })
  }

  const ab = await wb.xlsx.writeBuffer()
  return Buffer.from(ab)
}

// ── Route handlers ────────────────────────────────────────────────────────────

export const listTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const templates = await prisma.excelTemplate.findMany({
      where: { schoolId },
      select: { id: true, name: true, classLevels: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ templates, total: templates.length, max: MAX_TEMPLATES })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
}

export const uploadTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' })
      return
    }

    const count = await prisma.excelTemplate.count({ where: { schoolId } })
    if (count >= MAX_TEMPLATES) {
      res.status(400).json({ message: `You have reached the ${MAX_TEMPLATES}-template limit. Delete a template to upload a new one.` })
      return
    }

    const name: string = req.body.name?.trim() || req.file.originalname.replace(/\.xlsx$/i, '')
    const classLevels: string[] = req.body.classLevels
      ? JSON.parse(req.body.classLevels)
      : []

    const template = await prisma.excelTemplate.create({
      data: { schoolId, name, fileData: Buffer.from(req.file.buffer), classLevels },
      select: { id: true, name: true, classLevels: true, createdAt: true },
    })

    res.status(201).json({ template })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { id } = req.params
    const { name, classLevels } = req.body

    const existing = await prisma.excelTemplate.findFirst({ where: { id: String(id), schoolId } })
    if (!existing) { res.status(404).json({ message: 'Template not found' }); return }

    const updated = await prisma.excelTemplate.update({
      where: { id: String(id) },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(classLevels !== undefined ? { classLevels } : {}),
      },
      select: { id: true, name: true, classLevels: true, createdAt: true },
    })

    res.json({ template: updated })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { id } = req.params

    const existing = await prisma.excelTemplate.findFirst({ where: { id: String(id), schoolId } })
    if (!existing) { res.status(404).json({ message: 'Template not found' }); return }

    await prisma.excelTemplate.delete({ where: { id: String(id) } })
    res.json({ message: 'Template deleted' })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
}

export const generateExcel = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { id, studentId } = req.params
    const session = req.query.session ? String(req.query.session) : null

    const template = await prisma.excelTemplate.findFirst({ where: { id: String(id), schoolId } })
    if (!template) { res.status(404).json({ message: 'Template not found' }); return }

    // Resolve session
    let resolvedSession = session
    if (!resolvedSession) {
      const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
      resolvedSession = cur?.session ?? null
    }
    if (!resolvedSession) { res.status(400).json({ message: 'No active academic year found' }); return }

    const sid = String(studentId)
    const [student, reportCards, gradingScaleRec, school] = await Promise.all([
      prisma.student.findFirst({ where: { id: sid, schoolId } }),
      prisma.reportCard.findMany({
        where: { studentId: sid, schoolId, term: { session: resolvedSession } },
        include: {
          term: true,
          entries: {
            include: { subject: { select: { id: true, name: true, credit: true, term: true, classLevel: true } } },
            orderBy: { subject: { name: 'asc' } },
          },
        },
        orderBy: { term: { name: 'asc' } },
      }),
      prisma.gradingScale.findUnique({ where: { schoolId } }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    ])

    if (!student) { res.status(404).json({ message: 'Student not found' }); return }

    // Parse grading scale
    const rawScale = gradingScaleRec?.ranges as any
    let gradingRanges: any[] = []
    let classificationBands: any[] = []
    if (Array.isArray(rawScale)) {
      gradingRanges = rawScale
    } else if (rawScale && Array.isArray(rawScale.ranges)) {
      gradingRanges = rawScale.ranges
      classificationBands = rawScale.classificationBands ?? []
    }

    // Split report cards into sem1 / sem2 by term name order
    const sorted = ([...reportCards] as any[]).sort((a, b) => a.term.name.localeCompare(b.term.name))
    const sem1Entries: any[] = sorted[0]?.entries ?? []
    const sem2Entries: any[] = sorted[1]?.entries ?? []

    const buffer = await buildFilledBuffer(
      Buffer.from(template.fileData as Uint8Array),
      student,
      school,
      resolvedSession,
      sem1Entries,
      sem2Entries,
      gradingRanges,
      classificationBands,
    )

    const filename = `${student.name.replace(/\s+/g, '_')}_transcript_${resolvedSession.replace('/', '-')}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const htmlPreviewTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { id, studentId } = req.params
    const session = req.query.session ? String(req.query.session) : null

    const template = await prisma.excelTemplate.findFirst({ where: { id: String(id), schoolId } })
    if (!template) { res.status(404).json({ message: 'Template not found' }); return }

    let resolvedSession = session
    if (!resolvedSession) {
      const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
      resolvedSession = cur?.session ?? null
    }
    if (!resolvedSession) { res.status(400).json({ message: 'No active academic year found' }); return }

    const sid = String(studentId)
    const [student, reportCards, gradingScaleRec, school] = await Promise.all([
      prisma.student.findFirst({ where: { id: sid, schoolId } }),
      prisma.reportCard.findMany({
        where: { studentId: sid, schoolId, term: { session: resolvedSession } },
        include: {
          term: true,
          entries: {
            include: { subject: { select: { id: true, name: true, credit: true, term: true, classLevel: true } } },
            orderBy: { subject: { name: 'asc' } },
          },
        },
        orderBy: { term: { name: 'asc' } },
      }),
      prisma.gradingScale.findUnique({ where: { schoolId } }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    ])
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }

    const rawScale = gradingScaleRec?.ranges as any
    let gradingRanges: any[] = []
    let classificationBands: any[] = []
    if (Array.isArray(rawScale)) {
      gradingRanges = rawScale
    } else if (rawScale && Array.isArray(rawScale.ranges)) {
      gradingRanges = rawScale.ranges
      classificationBands = rawScale.classificationBands ?? []
    }

    const sorted = ([...reportCards] as any[]).sort((a, b) => a.term.name.localeCompare(b.term.name))
    const sem1Entries: any[] = sorted[0]?.entries ?? []
    const sem2Entries: any[] = sorted[1]?.entries ?? []

    const buffer = await buildFilledBuffer(
      Buffer.from(template.fileData as Uint8Array),
      student, school, resolvedSession,
      sem1Entries, sem2Entries, gradingRanges, classificationBands,
    )

    // Re-load the filled buffer and render the first sheet to HTML
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buffer as any)
    const ws = wb2.worksheets[0]
    if (!ws) { res.json({ html: '<p>No worksheet found</p>' }); return }

    // Build skip-set from merged cells so we don't render non-master cells
    const skipCells = new Set<string>()
    const spanMap = new Map<string, { colspan: number; rowspan: number }>()
    const rawMerges: string[] = (ws as any).model?.merges ?? []
    for (const merge of rawMerges) {
      const [tl, br] = merge.split(':')
      const tlCell = ws.getCell(tl) as any
      const brCell = ws.getCell(br) as any
      const colspan = (brCell.col as number) - (tlCell.col as number) + 1
      const rowspan = (brCell.row as number) - (tlCell.row as number) + 1
      spanMap.set(tl, { colspan, rowspan })
      const tlRow = tlCell.row as number, tlCol = tlCell.col as number
      const brRow = brCell.row as number, brCol = brCell.col as number
      for (let r = tlRow; r <= brRow; r++) {
        for (let c = tlCol; c <= brCol; c++) {
          if (r === tlRow && c === tlCol) continue
          skipCells.add(`${r}:${c}`)
        }
      }
    }

    let html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10px;width:100%;table-layout:auto">'
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      html += '<tr>'
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (skipCells.has(`${rowNum}:${colNum}`)) return
        const val = cellText(cell)
        const span = spanMap.get(cell.address)
        const styles: string[] = ['padding:3px 6px', 'border:1px solid #e5e7eb', 'vertical-align:middle']
        if (cell.font?.bold) styles.push('font-weight:bold')
        if (cell.font?.size && cell.font.size > 10) styles.push(`font-size:${Math.min(cell.font.size, 18)}px`)
        if (cell.font?.color?.argb && cell.font.color.argb.toLowerCase() !== 'ff000000') {
          styles.push(`color:#${cell.font.color.argb.slice(2)}`)
        }
        const fgColor = (cell.fill as any)?.fgColor?.argb
        if (fgColor && fgColor !== '00000000' && fgColor.toLowerCase() !== 'ffffffff') {
          styles.push(`background:#${fgColor.slice(2)}`)
        }
        const align = cell.alignment?.horizontal
        if (align === 'center') styles.push('text-align:center')
        else if (align === 'right') styles.push('text-align:right')
        const colspan = span && span.colspan > 1 ? ` colspan="${span.colspan}"` : ''
        const rowspan = span && span.rowspan > 1 ? ` rowspan="${span.rowspan}"` : ''
        html += `<td${colspan}${rowspan} style="${styles.join(';')}">${val || '&nbsp;'}</td>`
      })
      html += '</tr>'
    })
    html += '</table>'

    res.json({ html })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const previewTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { id } = req.params

    const [template, gradingScaleRec, school] = await Promise.all([
      prisma.excelTemplate.findFirst({ where: { id: String(id), schoolId } }),
      prisma.gradingScale.findUnique({ where: { schoolId } }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    ])
    if (!template) { res.status(404).json({ message: 'Template not found' }); return }

    const rawScale = gradingScaleRec?.ranges as any
    let gradingRanges: any[] = []
    let classificationBands: any[] = []
    if (Array.isArray(rawScale)) {
      gradingRanges = rawScale
    } else if (rawScale && Array.isArray(rawScale.ranges)) {
      gradingRanges = rawScale.ranges
      classificationBands = rawScale.classificationBands ?? []
    }
    if (!gradingRanges.length) {
      gradingRanges = [
        { minScore: 80, maxScore: 100, grade: 'A',  gradePoint: 4.0 },
        { minScore: 70, maxScore: 79,  grade: 'B+', gradePoint: 3.5 },
        { minScore: 60, maxScore: 69,  grade: 'B',  gradePoint: 3.0 },
        { minScore: 55, maxScore: 59,  grade: 'C+', gradePoint: 2.5 },
        { minScore: 50, maxScore: 54,  grade: 'C',  gradePoint: 2.0 },
        { minScore: 45, maxScore: 49,  grade: 'D',  gradePoint: 1.0 },
        { minScore: 0,  maxScore: 44,  grade: 'F',  gradePoint: 0.0 },
      ]
    }
    if (!classificationBands.length) {
      classificationBands = [
        { min: 3.60, max: 4.00, label: 'Distinction' },
        { min: 2.80, max: 3.59, label: 'Upper Credit' },
        { min: 2.40, max: 2.79, label: 'Lower Credit' },
        { min: 2.00, max: 2.39, label: 'Pass' },
        { min: 0.00, max: 1.99, label: 'Fail' },
      ]
    }

    const dummyStudent = { name: 'SAMPLE STUDENT', studentId: 'STU-0001', classLevel: 'HND Level 1', gender: 'M', dateOfBirth: '2000-01-01' }
    const dummySchool  = { name: school?.name ?? 'Your School' }
    const dummySession = '2024/2025'

    const makeEntry = (name: string, credit: number, score: number) => ({ score, subject: { name, credit } })
    const sem1Entries = [
      makeEntry('Mathematics',        4, 75),
      makeEntry('Physics',            3, 62),
      makeEntry('Computer Science',   3, 83),
      makeEntry('English Language',   2, 55),
      makeEntry('Communication',      2, 71),
    ]
    const sem2Entries = [
      makeEntry('Advanced Mathematics', 4, 68),
      makeEntry('Electronics',          3, 79),
      makeEntry('Database Systems',     3, 88),
      makeEntry('French Language',      2, 60),
      makeEntry('Technical Drawing',    2, 73),
    ]

    const buffer = await buildFilledBuffer(
      Buffer.from(template.fileData as Uint8Array),
      dummyStudent, dummySchool, dummySession,
      sem1Entries, sem2Entries, gradingRanges, classificationBands,
    )

    const filename = `${template.name.replace(/\s+/g, '_')}_preview.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const downloadExampleTemplate = async (_req: AuthRequest, res: Response) => {
  try {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Transcript')

    const primary = '1E3A5F'
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + primary } }
    const boldWhite: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
    const bold: Partial<ExcelJS.Font> = { bold: true }
    const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCCCCCC' } }
    const allBorders: Partial<ExcelJS.Borders> = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }

    const tag = (t: string) => `{{${t}}}`

    // Title
    ws.mergeCells('A1:G1')
    const titleCell = ws.getCell('A1')
    titleCell.value = tag('school_name') + '  —  ANNUAL TRANSCRIPT  —  ' + tag('academic_year')
    titleCell.font = { ...bold, size: 14, color: { argb: 'FF' + primary } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 30

    // Student info block
    const infoRows: [string, string][] = [
      ['Student Name:', tag('student_name')],
      ['Matricule No.:', tag('student_id')],
      ['Program:', tag('program')],
      ['Session:', tag('session')],
      ['Gender:', tag('gender')],
    ]
    infoRows.forEach(([label, value], i) => {
      const r = ws.getRow(i + 2)
      r.getCell(1).value = label; r.getCell(1).font = bold
      r.getCell(2).value = value
    })

    // Helper to render a semester block
    const addSemBlock = (startRow: number, semKey: 'sem1' | 'sem2', title: string): number => {
      let r = startRow

      // Semester title
      ws.mergeCells(`A${r}:G${r}`)
      const semTitleCell = ws.getCell(`A${r}`)
      semTitleCell.value = title
      semTitleCell.fill  = headerFill
      semTitleCell.font  = boldWhite
      semTitleCell.alignment = { horizontal: 'center' }
      r++

      // Column header
      const headers = ['CODE', 'TITLE', 'CREDIT', 'MARK /100', 'GRADE', 'GRADE POINT', 'WEIGHTED POINT']
      const hRow = ws.getRow(r)
      headers.forEach((h, ci) => {
        const cell = hRow.getCell(ci + 1)
        cell.value = h; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
        cell.font = bold; cell.border = allBorders; cell.alignment = { horizontal: 'center' }
      })
      r++

      // Start marker
      ws.getCell(`A${r}`).value = `{{#${semKey}_courses}}`
      r++

      // Template course row
      const courseRow = ws.getRow(r)
      const courseTags = ['{{code}}', '{{title}}', '{{credit}}', '{{mark}}', '{{grade}}', '{{grade_point}}', '{{weighted_point}}']
      courseTags.forEach((t, ci) => {
        const cell = courseRow.getCell(ci + 1)
        cell.value = t; cell.border = allBorders
        cell.alignment = { horizontal: ci <= 1 ? 'left' : 'center' }
      })
      r++

      // End marker
      ws.getCell(`A${r}`).value = `{{/${semKey}_courses}}`
      r++

      // Totals row
      const totRow = ws.getRow(r)
      ;[`TOTAL`, '', tag(`${semKey}_credit_total`), tag(`${semKey}_mark_total`), '', tag(`${semKey}_gp_total`), tag(`${semKey}_wp_total`)].forEach((v, ci) => {
        const cell = totRow.getCell(ci + 1)
        cell.value = v; cell.font = bold; cell.border = allBorders
        cell.alignment = { horizontal: ci <= 1 ? 'left' : 'center' }
      })
      r++

      // GPA row
      ws.mergeCells(`A${r}:F${r}`)
      ws.getCell(`A${r}`).value = `${title} GPA:`
      ws.getCell(`A${r}`).font = { ...bold, color: { argb: 'FF' + primary } }
      ws.getCell(`A${r}`).alignment = { horizontal: 'right' }
      ws.getCell(`G${r}`).value = tag(`${semKey}_gpa`)
      ws.getCell(`G${r}`).font = { ...bold, size: 13, color: { argb: 'FF' + primary } }
      ws.getCell(`G${r}`).alignment = { horizontal: 'center' }
      r += 2

      return r
    }

    let row = addSemBlock(8, 'sem1', '1ST SEMESTER')
    row = addSemBlock(row, 'sem2', '2ND SEMESTER')

    // Overall summary
    const summaryData: [string, string][] = [
      ['Overall Credits Earned:', tag('overall_credits')],
      ['Cumulative GPA (CGPA):', tag('cgpa')],
      ['Remark:', tag('remark')],
    ]
    summaryData.forEach(([label, value], i) => {
      ws.getCell(`E${row + i}`).value = label
      ws.getCell(`E${row + i}`).font = bold
      ws.getCell(`G${row + i}`).value = value
      ws.getCell(`G${row + i}`).font = { ...bold, size: i === 2 ? 13 : 11, color: { argb: 'FF' + primary } }
    })

    // Column widths
    ws.columns = [
      { width: 14 }, { width: 40 }, { width: 9 }, { width: 11 },
      { width: 9 }, { width: 14 }, { width: 16 },
    ]

    // Instructions sheet
    const infoWs = wb.addWorksheet('Tag Reference')
    const tags: [string, string][] = [
      ['{{student_name}}', 'Full name of the student'],
      ['{{student_id}}',   'Matricule / student ID'],
      ['{{program}}',      'Class level / program'],
      ['{{session}}',      'Academic year (e.g. 2024/2025)'],
      ['{{gender}}',       'Student gender'],
      ['{{date_of_birth}}','Date of birth'],
      ['{{school_name}}',  'Name of the school'],
      ['{{academic_year}}','Same as session'],
      ['{{sem1_credit_total}}', 'Semester 1 total credits'],
      ['{{sem1_mark_total}}',   'Semester 1 sum of marks'],
      ['{{sem1_gp_total}}',     'Semester 1 sum of grade points'],
      ['{{sem1_wp_total}}',     'Semester 1 sum of weighted points'],
      ['{{sem1_gpa}}',          'Semester 1 GPA'],
      ['{{sem2_credit_total}}', 'Semester 2 total credits'],
      ['{{sem2_mark_total}}',   'Semester 2 sum of marks'],
      ['{{sem2_gp_total}}',     'Semester 2 sum of grade points'],
      ['{{sem2_wp_total}}',     'Semester 2 sum of weighted points'],
      ['{{sem2_gpa}}',          'Semester 2 GPA'],
      ['{{overall_credits}}',   'Overall credits earned (both semesters)'],
      ['{{cgpa}}',              'Cumulative GPA'],
      ['{{remark}}',            'Classification (e.g. UPPER CREDIT)'],
      ['', ''],
      ['REPEATING ROWS', ''],
      ['{{#sem1_courses}}', 'Put this tag in a cell on its own row to mark the START of the semester 1 course block'],
      ['{{/sem1_courses}}', 'Put this tag in a cell on its own row to mark the END of the semester 1 course block'],
      ['{{#sem2_courses}}', 'Start of semester 2 course block'],
      ['{{/sem2_courses}}', 'End of semester 2 course block'],
      ['', ''],
      ['INSIDE COURSE ROWS', ''],
      ['{{code}}',           'Course code'],
      ['{{title}}',          'Course title'],
      ['{{credit}}',         'Credit hours'],
      ['{{mark}}',           'Student mark'],
      ['{{grade}}',          'Grade letter (A, B+, etc.)'],
      ['{{grade_point}}',    'Grade point (0.00–4.00)'],
      ['{{weighted_point}}', 'Credit × Grade Point'],
    ]

    infoWs.getRow(1).values = ['Tag', 'Description']
    infoWs.getRow(1).font = { bold: true }
    tags.forEach((row, i) => {
      infoWs.getRow(i + 2).values = row
    })
    infoWs.columns = [{ width: 28 }, { width: 55 }]

    const ab = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="excel_template_example.xlsx"')
    res.send(Buffer.from(ab))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}
