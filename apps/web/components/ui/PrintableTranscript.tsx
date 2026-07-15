'use client'

/**
 * University Annual Transcript — two-semester layout.
 *
 * GPA Algorithm (CITEC / image-derived):
 *   - Marks are /100 (CA /30 + Exam /70). The grading scale ranges use /100 minScore/maxScore.
 *   - Grade Point (GP)   = lookup mark in grading scale ranges (0-4.0 scale).
 *   - Weighted Point (WP) = Credit × GP.
 *   - Semester GPA       = Σ(WP for semester) / Σ(Credits for semester).
 *   - CGPA               = Σ(WP both semesters) / Σ(Credits both semesters).
 *   - Overall Credits Earned = Σ(all credits registered, both semesters, pass or fail).
 *   - Remark / Classification = derived from CGPA bands (editable per school).
 */

import { StudentTranscript, TranscriptEntry } from '@/lib/api/reportcards'
import { DEFAULT_CLASSIFICATION_BANDS } from '@/lib/api/gradingScale'

interface GradeRange {
  id: string; minScore: number; maxScore: number
  grade: string; remark: string; color: string; gradePoint?: number
}

interface ClassificationBand {
  min: number; max: number; label: string
}

// ── GPA helpers ──────────────────────────────────────────────────────────────

function gpForMark(score: number | null, ranges: GradeRange[]): { grade: string; gradePoint: number; remark: string; color: string } {
  if (score == null) return { grade: '—', gradePoint: 0, remark: '—', color: '#ccc' }
  const sorted = [...ranges].sort((a, b) => b.minScore - a.minScore)
  const r = sorted.find((x) => score >= x.minScore && score <= x.maxScore)
  return { grade: r?.grade ?? 'F', gradePoint: r?.gradePoint ?? 0, remark: r?.remark ?? 'Fail', color: r?.color ?? '#dc2626' }
}

function classificationLabel(cgpa: number, bands: ClassificationBand[]): string {
  const sorted = [...bands].sort((a, b) => b.min - a.min)
  return sorted.find(b => cgpa >= b.min && cgpa <= b.max)?.label?.toUpperCase() ?? 'FAIL'
}

const LEGEND_ROWS = [
  { abbr: 'I',    meaning: 'Incomplete' },
  { abbr: 'X',    meaning: 'Absent' },
  { abbr: '*',    meaning: 'Mark obtained after resit' },
  { abbr: 'GP',   meaning: 'Grade Point' },
  { abbr: 'GPA',  meaning: 'Grade Point Average' },
  { abbr: 'CGPA', meaning: 'Cumulative Grade Point Average' },
  { abbr: 'WP',   meaning: 'Weighted Point (Credit × GP)' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '5px 7px', border: '1px solid #999', fontWeight: 'bold', textAlign: 'center', fontSize: '11px',
}
const td: React.CSSProperties = {
  padding: '4px 7px', border: '1px solid #ccc', fontSize: '11px', textAlign: 'center',
}
const tdL: React.CSSProperties = { ...td, textAlign: 'left' }

interface SemesterTableProps {
  label: string
  entries: TranscriptEntry[]
  ranges: GradeRange[]
  maxScore: number
  primaryColor: string
  highlightFailingRed?: boolean
}

function SemesterTable({ label, entries, ranges, maxScore, primaryColor, highlightFailingRed = true }: SemesterTableProps) {
  const rgb = hexToRgb(primaryColor)

  const rows = entries.map((e) => {
    const score = e.score
    const { grade, gradePoint, color } = gpForMark(score, ranges)
    const credit = e.subject.credit ?? 0
    const wp = gradePoint * credit
    return { entry: e, score, grade, gradePoint, color, credit, wp }
  })

  const resitRows = rows.filter((r) => r.entry.resitScore != null)

  const totalCredits  = rows.reduce((s, r) => s + r.credit, 0)
  const totalMarkSum  = rows.reduce((s, r) => s + (r.score ?? 0), 0)
  const totalGPSum    = rows.reduce((s, r) => s + r.gradePoint, 0)
  const totalWP       = rows.reduce((s, r) => s + r.wp, 0)
  const semGPA        = totalCredits > 0 ? totalWP / totalCredits : 0

  const ftBold: React.CSSProperties = { ...td, fontWeight: 'bold' }

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ backgroundColor: primaryColor, color: '#fff', padding: '5px 10px', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
        {label}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '8%' }} />
          <col style={{ width: '36%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: `rgba(${rgb},0.1)` }}>
            <th style={th}>CODE</th>
            <th style={{ ...th, textAlign: 'left' }}>TITLE</th>
            <th style={th}>CREDIT</th>
            <th style={th}>MARK /{maxScore}</th>
            <th style={th}>GRADE</th>
            <th style={th}>GRADE POINT</th>
            <th style={th}>WEIGHTED POINT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, score, grade, gradePoint, color, credit, wp }, i) => {
            const isFail = highlightFailingRed && grade === 'F'
            return (
              <tr key={entry.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                <td style={td}>{entry.subject.code ?? '—'}</td>
                <td style={tdL}>{entry.subject.name}</td>
                <td style={td}>{credit || '—'}</td>
                <td style={{ ...td, fontWeight: 'bold', color: isFail ? '#dc2626' : 'inherit' }}>
                  {score != null ? score : '—'}{entry.resitScore != null ? <sup>*</sup> : null}
                </td>
                <td style={{ ...td, fontWeight: 'bold', color }}>{grade}</td>
                <td style={td}>{gradePoint.toFixed(2)}</td>
                <td style={td}>{wp.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          {/* TOTAL row — sums for credit, mark, grade point, weighted point */}
          <tr style={{ backgroundColor: `rgba(${rgb},0.12)`, borderTop: `2px solid ${primaryColor}` }}>
            <td colSpan={2} style={{ ...tdL, fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.5px' }}>TOTAL</td>
            <td style={ftBold}>{totalCredits}</td>
            <td style={ftBold}>{totalMarkSum % 1 === 0 ? totalMarkSum : totalMarkSum.toFixed(1)}</td>
            <td style={td}></td>
            <td style={ftBold}>{totalGPSum % 1 === 0 ? totalGPSum : totalGPSum.toFixed(1)}</td>
            <td style={ftBold}>{totalWP.toFixed(2)}</td>
          </tr>
          {/* SEMESTER GPA row — label on right side, value at far right */}
          <tr style={{ backgroundColor: `rgba(${rgb},0.06)` }}>
            <td colSpan={2} style={td}></td>
            <td colSpan={4} style={{ ...td, fontWeight: 'bold', color: primaryColor, textAlign: 'right', fontSize: '11px', letterSpacing: '0.5px', paddingRight: '10px' }}>
              {label} GPA:
            </td>
            <td style={{ ...td, fontWeight: 'bold', color: primaryColor, fontSize: '15px' }}>
              {semGPA.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Resits — courses in this semester the student resat. CA carries over unchanged;
          the Exam figure is the new (resit) mark, shown elsewhere in the main table with an
          asterisk. Listed here for transparency, matching the transcript's real-world source. */}
      {resitRows.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: `rgba(${rgb},0.06)` }}>
                <th colSpan={7} style={{ ...th, textAlign: 'left', fontSize: '10px', backgroundColor: `rgba(${rgb},0.06)` }}>
                  {label} — RESITS
                </th>
              </tr>
              <tr style={{ backgroundColor: `rgba(${rgb},0.1)` }}>
                <th style={th}>CODE</th>
                <th style={{ ...th, textAlign: 'left' }}>TITLE</th>
                <th style={th}>CA</th>
                <th style={th}>ORIGINAL EXAM</th>
                <th style={th}>RESIT EXAM</th>
                <th style={th}>NEW MARK</th>
                <th style={th}>NEW GRADE</th>
              </tr>
            </thead>
            <tbody>
              {resitRows.map(({ entry, score, grade, color }, i) => (
                <tr key={entry.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                  <td style={td}>{entry.subject.code ?? '—'}</td>
                  <td style={tdL}>{entry.subject.name}</td>
                  <td style={td}>{entry.seq1Score ?? '—'}</td>
                  <td style={td}>{entry.seq2Score ?? '—'}</td>
                  <td style={td}>{entry.resitScore}<sup>*</sup></td>
                  <td style={{ ...td, fontWeight: 'bold' }}>{score != null ? score : '—'}</td>
                  <td style={{ ...td, fontWeight: 'bold', color }}>{grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '30, 58, 95'
}

// ── Main component ────────────────────────────────────────────────────────────

export interface PrintableTranscriptProps {
  data: StudentTranscript
  primaryColor?: string
  showGradeSystem?: boolean
  showClassification?: boolean
  showLegend?: boolean
  highlightFailingRed?: boolean
  deanLabel?: string
  registrarLabel?: string
  reportTitle?: string
  academicYearLabel?: string
}

export function PrintableTranscript({
  data,
  primaryColor = '#1e3a5f',
  showGradeSystem = true,
  showClassification = true,
  highlightFailingRed = true,
  showLegend = true,
  deanLabel = "Dean of Studies' Signature",
  registrarLabel = "Registrar's Signature",
  reportTitle = 'Annual Transcript',
  academicYearLabel = 'Academic Year',
}: PrintableTranscriptProps) {
  const { student, school, session, reportCards, maxScore, gradingScale } = data
  const classificationBands: ClassificationBand[] =
    data.classificationBands?.length > 0 ? data.classificationBands : DEFAULT_CLASSIFICATION_BANDS

  // Order report cards so First Semester comes before Second Semester.
  const sorted = [...reportCards].sort((a, b) => a.term.name.localeCompare(b.term.name))
  const sem1 = sorted[0]
  const sem2 = sorted[1]

  // CGPA across both semesters.
  const allEntries = [...(sem1?.entries ?? []), ...(sem2?.entries ?? [])]
  let totalWP = 0, totalCredits = 0
  for (const e of allEntries) {
    const { gradePoint } = gpForMark(e.score, gradingScale)
    const credit = e.subject.credit ?? 0
    totalWP += gradePoint * credit
    totalCredits += credit
  }
  const cgpa = totalCredits > 0 ? totalWP / totalCredits : 0
  const classification = classificationLabel(cgpa, classificationBands)

  // Per-semester GPA for summary table.
  function calcSemGPA(entries: typeof allEntries) {
    let wp = 0, cr = 0
    for (const e of entries) { const g = gpForMark(e.score, gradingScale); wp += g.gradePoint * (e.subject.credit ?? 0); cr += e.subject.credit ?? 0 }
    return cr > 0 ? wp / cr : 0
  }
  const sem2GPA = sem2 ? calcSemGPA(sem2.entries) : 0

  const rgb = hexToRgb(primaryColor)

  return (
    <div
      id="transcript-printable"
      style={{
        fontFamily: 'Arial, sans-serif',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '36px 40px',
        color: '#111',
        fontSize: '12px',
        backgroundColor: '#fff',
        position: 'relative',
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', borderBottom: `3px solid ${primaryColor}`, paddingBottom: '14px', marginBottom: '18px' }}>
        {school.logo && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
            <img src={school.logo} alt="logo" style={{ width: 70, height: 70, objectFit: 'contain' }} />
          </div>
        )}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 2px', color: primaryColor, textTransform: 'uppercase' }}>
          {school.name}
        </h1>
        <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>{academicYearLabel}: {session}</div>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '8px 0 0', letterSpacing: '3px', textTransform: 'uppercase', color: primaryColor }}>
          {reportTitle}
        </h2>
      </div>

      {/* ── Student Info ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px 20px',
          marginBottom: '18px',
          backgroundColor: `rgba(${rgb},0.05)`,
          padding: '10px 14px',
          border: `1px solid rgba(${rgb},0.25)`,
          fontSize: '12px',
        }}
      >
        {[
          ['Student Name', student.name],
          ['Matricule No.', student.studentId],
          ['Department / Program', student.classLevel],
          ['Academic Year', session],
          ['Sex', student.gender ?? '—'],
          student.dateOfBirth ? ['Date of Birth', student.dateOfBirth] : null,
        ].filter(Boolean).map(([k, v]: any) => (
          <div key={k}>
            <span style={{ fontWeight: 'bold' }}>{k}:</span>&nbsp;{v}
          </div>
        ))}
      </div>

      {/* ── Semester Tables ── */}
      {sem1 && (
        <SemesterTable
          label={sem1.term.name.toUpperCase()}
          entries={sem1.entries}
          ranges={gradingScale}
          maxScore={maxScore}
          primaryColor={primaryColor}
          highlightFailingRed={highlightFailingRed}
        />
      )}
      {sem2 && (
        <SemesterTable
          label={sem2.term.name.toUpperCase()}
          entries={sem2.entries}
          ranges={gradingScale}
          maxScore={maxScore}
          primaryColor={primaryColor}
          highlightFailingRed={highlightFailingRed}
        />
      )}

      {/* ── Bottom: grade table (left) + overall summary (right) ── */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginTop: '10px', marginBottom: '28px' }}>

        {/* LEFT: unified Grade System | Classification | Legend */}
        {(showGradeSystem || showClassification || showLegend) && (() => {
          const gradeRows = [...gradingScale].sort((a, b) => b.minScore - a.minScore)
          const bandRows  = [...classificationBands].sort((a, b) => b.min - a.min)
          const maxRows   = Math.max(
            showGradeSystem    ? gradeRows.length : 0,
            showClassification ? bandRows.length  : 0,
            showLegend         ? LEGEND_ROWS.length : 0,
          )
          const sepR: React.CSSProperties = { borderRight: `1px solid rgba(${rgb},0.3)` }
          const hdrCell: React.CSSProperties = {
            ...th, backgroundColor: `rgba(${rgb},0.08)`, fontSize: '10px', padding: '3px 6px',
          }
          return (
            <table style={{ flex: '1.6', borderCollapse: 'collapse', border: `1px solid rgba(${rgb},0.35)` }}>
              <thead>
                <tr>
                  {showGradeSystem && (
                    <th colSpan={3} style={{ backgroundColor: primaryColor, color: '#fff', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', textAlign: 'center', ...sepR }}>
                      GRADE SYSTEM
                    </th>
                  )}
                  {showClassification && (
                    <th style={{ backgroundColor: primaryColor, color: '#fff', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', textAlign: 'center', ...sepR }}>
                      CLASSIFICATION
                    </th>
                  )}
                  {showLegend && (
                    <th style={{ backgroundColor: primaryColor, color: '#fff', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>
                      LEGEND
                    </th>
                  )}
                </tr>
                <tr style={{ backgroundColor: `rgba(${rgb},0.06)` }}>
                  {showGradeSystem && (<>
                    <th style={hdrCell}>GRADE</th>
                    <th style={hdrCell}>MARK /{maxScore}</th>
                    <th style={{ ...hdrCell, ...sepR }}>GP</th>
                  </>)}
                  {showClassification && (
                    <th style={{ ...hdrCell, textAlign: 'left', ...sepR }}>GPA / REMARK</th>
                  )}
                  {showLegend && (
                    <th style={{ ...hdrCell, textAlign: 'left' }}></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }).map((_, i) => {
                  const gr = gradeRows[i]
                  const br = bandRows[i]
                  const lr = LEGEND_ROWS[i]
                  const rowBg = i % 2 === 1 ? `rgba(${rgb},0.03)` : 'transparent'
                  const cell: React.CSSProperties = { ...td, fontSize: '10px', padding: '3px 6px', borderColor: '#e5e5e5', backgroundColor: rowBg }
                  const cellL: React.CSSProperties = { ...tdL, fontSize: '10px', padding: '3px 6px', borderColor: '#e5e5e5', backgroundColor: rowBg }
                  return (
                    <tr key={i}>
                      {showGradeSystem && (<>
                        <td style={{ ...cell, color: gr?.color ?? 'inherit', fontWeight: gr ? 'bold' : 'normal' }}>{gr?.grade ?? ''}</td>
                        <td style={cell}>{gr ? `${gr.minScore}–${gr.maxScore}` : ''}</td>
                        <td style={{ ...cell, ...sepR }}>{gr ? (gr.gradePoint ?? 0).toFixed(1) : ''}</td>
                      </>)}
                      {showClassification && (
                        <td style={{ ...cellL, ...sepR }}>
                          {br ? <>{br.min.toFixed(2)} – {br.max.toFixed(2)} / <strong>{br.label}</strong></> : ''}
                        </td>
                      )}
                      {showLegend && (
                        <td style={cellL}>
                          {lr ? <><strong style={{ minWidth: '36px', display: 'inline-block' }}>{lr.abbr}</strong> = {lr.meaning}</> : ''}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })()}

        {/* RIGHT: overall summary — matches real transcript style */}
        <div style={{
          flex: '1',
          border: `1px solid rgba(${rgb},0.35)`,
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
        }}>
          <div style={{ borderBottom: '1px solid #e5e5e5', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#444', whiteSpace: 'nowrap' }}>Overall Credits Earned:</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: primaryColor }}>{totalCredits}</span>
          </div>
          <div style={{ borderBottom: '1px solid #e5e5e5', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#444', whiteSpace: 'nowrap' }}>Cumulative GPA:</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: primaryColor }}>{cgpa.toFixed(2)}</span>
          </div>
          <div style={{ padding: '7px 12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#444', marginBottom: '4px', textAlign: 'left' }}>Remark:</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: primaryColor, letterSpacing: '1px' }}>{classification}</div>
          </div>
        </div>

      </div>

      {/* ── Signatures ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px' }}>
        {[deanLabel, registrarLabel].map((label) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #111', height: '44px', marginBottom: '6px' }} />
            <div style={{ fontSize: '11px', color: '#555' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #ccc', paddingTop: '8px', textAlign: 'center', fontSize: '10px', color: '#999' }}>
        Generated on {new Date().toLocaleDateString()}
      </div>
    </div>
  )
}
