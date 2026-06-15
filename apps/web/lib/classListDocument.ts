import { ClassListConfig } from './api/classListTemplate'

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface ClassListDocOptions {
  students: { name: string; studentId: string }[]
  classLevel: string
  schoolName: string
  schoolType: string
  logoUrl?: string | null
  config: ClassListConfig
}

/** Build the full printable Class List HTML document from the saved design config. */
export function buildClassListHtml({ students, classLevel, schoolName, schoolType, logoUrl, config }: ClassListDocOptions): string {
  const c = config
  const groups = (c.groups ?? []).filter(g => g.columns.length > 0)
  const totalMarkCols = groups.reduce((n, g) => n + g.columns.length, 0)

  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name))
  const blanks = Array(Math.max(0, c.blankRows)).fill(null)

  const markCells = () =>
    groups.map(g => g.columns.map(col => `<td class="${col.avg ? 'avg' : 'score'}"></td>`).join('')).join('')

  const rowHtml = [
    ...sorted.map((s, i) => `<tr>
      <td class="num">${i + 1}</td>
      ${c.showId ? `<td class="sid">${esc(s.studentId)}</td>` : ''}
      <td class="name">${esc(s.name)}</td>
      ${markCells()}
    </tr>`),
    ...blanks.map((_, i) => `<tr class="blank-row">
      <td class="num">${sorted.length + i + 1}</td>
      ${c.showId ? '<td class="sid"></td>' : ''}
      <td class="name"></td>
      ${markCells()}
    </tr>`),
  ].join('')

  const groupHead = groups.map(g => `<th colspan="${g.columns.length}" class="term-hd">${esc(g.label)}</th>`).join('')
  const colHead = groups.map(g =>
    g.columns.map(col => `<th class="sub-hd${col.avg ? ' avg-hd' : ''}">${esc(col.label)}</th>`).join('')
  ).join('')

  const fixedCols = 1 + (c.showId ? 1 : 0) + 1 // # + ID? + Name

  const metaItems = [
    `<div class="meta-item"><strong>Class:</strong>&nbsp;${esc(classLevel)}</div>`,
    c.showMeta.subject ? `<div class="meta-item"><strong>Subject:</strong>&nbsp;<span class="fill-line"></span></div>` : '',
    c.showMeta.teacher ? `<div class="meta-item"><strong>Teacher:</strong>&nbsp;<span class="fill-line" style="min-width:120px"></span></div>` : '',
    c.showMeta.year ? `<div class="meta-item"><strong>Academic Year:</strong>&nbsp;<span class="fill-line" style="min-width:80px"></span></div>` : '',
    `<div class="meta-item"><strong>Students:</strong>&nbsp;${sorted.length}</div>`,
  ].join('')

  const footer = c.footerFields.map((f, i) =>
    `<div class="footer-field"${i >= 2 ? ' style="flex:0.6"' : ''}>
      <div class="footer-label">${esc(f)}</div>
      <div class="footer-line"></div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Class List — ${esc(classLevel)} | ${esc(schoolName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; padding: 14px; color: #111; }
  .header { text-align: center; border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .logo { width: 52px; height: 52px; object-fit: contain; }
  .school-name { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  .school-type { font-size: 12px; color: #555; margin-top: 2px; text-transform: uppercase; letter-spacing: 2px; }
  .subtitle { font-size: 11px; color: #444; margin-top: 3px; }
  .doc-title { font-size: 14px; font-weight: bold; margin-top: 8px; text-transform: uppercase; letter-spacing: 1.5px; border: 2px solid ${c.headerColor}; color: ${c.headerColor}; display: inline-block; padding: 3px 18px; }
  .meta { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; font-size: 11px; margin-bottom: 10px; gap: 8px; }
  .meta-item { display: flex; align-items: center; gap: 4px; }
  .fill-line { display: inline-block; border-bottom: 1px solid #555; min-width: 90px; height: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { border: 1px solid #333; padding: 4px 3px; text-align: center; font-weight: bold; }
  td { border: 1px solid #888; padding: 0 3px; height: 22px; text-align: center; }
  .name { text-align: left; padding-left: 6px; min-width: 140px; }
  .sid { color: #666; font-size: 10px; min-width: 55px; }
  .num { width: 26px; font-size: 10px; color: #555; }
  .score { min-width: 40px; }
  .avg { min-width: 40px; background: ${c.accentColor}14; font-weight: bold; }
  .term-hd { background: ${c.headerColor}; color: #fff; font-size: 11px; letter-spacing: 0.5px; }
  .sub-hd { background: #ddd; font-size: 10px; }
  .avg-hd { background: ${c.accentColor}; color: #fff; }
  .col-hd { background: #f5f5f5; font-size: 10px; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:nth-child(even) td.avg { background: ${c.accentColor}22; }
  .blank-row td { background: #fff !important; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; gap: 16px; border-top: 1px solid #ccc; padding-top: 14px; }
  .footer-field { flex: 1; }
  .footer-label { color: #444; margin-bottom: 4px; }
  .footer-line { border-bottom: 1px solid #111; height: 18px; }
  @page { size: A4 ${c.orientation}; margin: 8mm; }
  @media print { body { padding: 0; } th, td, .term-hd, .avg-hd, .avg { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="header">
    <div class="brand">
      ${c.showLogo && logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="logo">` : ''}
      <div>
        <div class="school-name">${esc(schoolName)}</div>
        ${c.showSchoolType ? `<div class="school-type">${esc(schoolType)} School</div>` : ''}
      </div>
    </div>
    ${c.subtitle ? `<div class="subtitle">${esc(c.subtitle)}</div>` : ''}
    <div style="margin-top:8px"><span class="doc-title">${esc(c.title)} &mdash; ${esc(classLevel)}</span></div>
  </div>

  <div class="meta">${metaItems}</div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" class="num col-hd">#</th>
        ${c.showId ? '<th rowspan="2" class="sid col-hd">ID</th>' : ''}
        <th rowspan="2" class="name col-hd" style="text-align:left;padding-left:6px">Student Name</th>
        ${groupHead}
      </tr>
      <tr>${colHead}</tr>
    </thead>
    <tbody>${rowHtml || `<tr><td colspan="${fixedCols + totalMarkCols}" style="height:40px;color:#999">No students</td></tr>`}</tbody>
  </table>

  <div class="footer">${footer}</div>
</body></html>`
}

/** Open a popup and print the class list built from the config. */
export function printClassList(opts: ClassListDocOptions) {
  const pw = window.open('', '_blank', 'width=1200,height=800')
  if (!pw) { alert('Allow popups to print the class list.'); return }
  pw.document.write(buildClassListHtml(opts))
  pw.document.close()
  pw.focus()
  setTimeout(() => { pw.print(); pw.addEventListener('afterprint', () => pw.close()) }, 350)
}
