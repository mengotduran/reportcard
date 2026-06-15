import { TemplateConfig, DEFAULT_CONFIG, LayoutSection, HeaderSec, StudentInfoSec, MarksTableSec, SummarySec, RemarksSec, SignaturesSec, TextBlockSec, DividerSec } from '@/lib/api/reportCardTemplate'

export interface PrintEntry {
  subjectId: string
  score: number
  seq1Score?: number | null
  seq2Score?: number | null
  grade: string
  remarks: string
}

interface PrintSubject { id: string; name: string }

export interface PrintableReportCardProps {
  school: { name: string; type: string; logo?: string | null }
  student: { name: string; studentId: string; classLevel: string; guardianName?: string }
  term: { name: string; session: string }
  subjects: PrintSubject[]
  entries: PrintEntry[]
  generalRemarks: string
  average: number
  position?: number | null
  config?: Partial<TemplateConfig>
}

function ordinalPos(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '30, 58, 95'
}

const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '6px 10px', borderBottom: '1px solid #ddd', ...extra,
})

function Watermark({ cfg, schoolLogo, schoolName }: { cfg: any; schoolLogo?: string | null; schoolName?: string }) {
  const wm = cfg.watermark
  if (!wm?.enabled) return null
  const opacity = (wm.opacity ?? 8) / 100
  const rotation = wm.rotation ?? -45
  const x = wm.x ?? 50
  const y = wm.y ?? 50
  // High z-index so the (faint) watermark stamps ON TOP of all content — a
  // logo is big enough to peek through transparent table cells, but centred
  // text would otherwise sit behind opaque sections and never show.
  const base: React.CSSProperties = { position: 'absolute', top: `${y}%`, left: `${x}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, pointerEvents: 'none', userSelect: 'none', zIndex: 9999 }
  if (wm.type === 'logo') {
    const src = wm.logoUrl || schoolLogo
    if (!src) return null
    const size = wm.size ?? 240
    return <img src={src} alt="" style={{ ...base, width: size, height: size, objectFit: 'contain', opacity }} />
  }
  return (
    <div style={{ ...base, fontSize: wm.size ?? 80, fontWeight: 'bold', opacity, color: wm.color || '#000', whiteSpace: 'nowrap' }}>
      {wm.text || schoolName || ''}
    </div>
  )
}

function Logo({ url, size, color }: { url?: string | null; size: number; color: string }) {
  if (url) return <img src={url} alt="school logo" style={{ width: size, height: size, objectFit: 'contain', display: 'block', borderRadius: 2 }} />
  return null
}

// ─── Classic ─────────────────────────────────────────────────────────────────
function Classic({ school, student, term, subjects, entries, generalRemarks, average, position, cfg }: any) {
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher's Signature",
    cfg.showPrincipalSig && `${cfg.principalTitle}'s Signature`,
    cfg.showParentSig && "Parent / Guardian's Signature",
  ].filter(Boolean) as string[]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: '40px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '13px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', borderBottom: `3px solid ${cfg.primaryColor}`, paddingBottom: '16px', marginBottom: '20px' }}>
        {school.logo && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Logo url={school.logo} size={60} color={cfg.primaryColor} /></div>}
        {cfg.showSchoolType && <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#666', letterSpacing: '2px', textTransform: 'uppercase' }}>{school.type} SCHOOL</p>}
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px', color: cfg.primaryColor }}>{school.name}</h1>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#555' }}>{cfg.schoolSubtitle}</p>}
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 0', letterSpacing: '3px', color: cfg.primaryColor }}>{cfg.reportTitle}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '20px', backgroundColor: `rgba(${rgb},0.05)`, padding: '12px', border: `1px solid rgba(${rgb},0.3)` }}>
        {[['Student Name', student.name], ['Student ID', student.studentId], ['Class', student.classLevel], ['Guardian', student.guardianName || '—'], ['Term', term.name], ['Session', term.session]].map(([k, v]) => (
          <div key={k}><span style={{ fontWeight: 'bold' }}>{k}:</span> {v}</div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Subject</th>
            {cfg.showSeq1 && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Seq. 1</th>}
            {cfg.showSeq2 && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Seq. 2</th>}
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Score</th>
            {cfg.showGrade && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Grade</th>}
            {cfg.showRemarks && <th style={{ padding: '8px 10px', textAlign: 'left' }}>Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                <td style={cell()}>{s.name}</td>
                {cfg.showSeq1 && <td style={cell({ textAlign: 'center' })}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={cell({ textAlign: 'center' })}>{e?.seq2Score ?? '—'}</td>}
                <td style={cell({ textAlign: 'center', fontWeight: 'bold' })}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={cell({ textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor })}>{e?.grade || '—'}</td>}
                {cfg.showRemarks && <td style={cell({ color: '#555' })}>{e?.remarks || '—'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Total Score', value: total },
          cfg.showAverage && { label: 'Average', value: `${average.toFixed(1)}` },
          cfg.showPosition && { label: 'Position', value: position != null ? `${position}` : '—' },
        ].filter(Boolean).map((item: any) => (
          <div key={item.label} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.value}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {cfg.showGeneralRemarks && (
        <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: '12px', marginBottom: '28px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px', color: cfg.primaryColor }}>General Remarks</div>
          <div style={{ color: '#444', minHeight: '36px' }}>{generalRemarks || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '24px', marginTop: '36px' }}>
          {sigLabels.map((label) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: `1px solid #111`, height: '40px', marginBottom: '6px' }} />
              <div style={{ fontSize: '11px', color: '#555' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '28px', borderTop: '1px solid #ccc', paddingTop: '8px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
        {cfg.footerText || `Generated on ${new Date().toLocaleDateString()}`}
      </div>
    </div>
  )
}

// ─── Bilingual ────────────────────────────────────────────────────────────────
function Bilingual({ school, student, term, subjects, entries, generalRemarks, average, position, cfg }: any) {
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && ['Maître de Classe', 'Class Teacher'],
    cfg.showPrincipalSig && [cfg.principalTitle, cfg.principalTitle],
    cfg.showParentSig && ['Parent / Tuteur', 'Parent / Guardian'],
  ].filter(Boolean) as [string, string][]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: '36px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '12px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', backgroundColor: cfg.primaryColor, color: '#fff', padding: '20px', marginBottom: '16px' }}>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '1px', opacity: 0.85 }}>{cfg.schoolSubtitle}</p>}
        {school.logo && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Logo url={school.logo} size={56} color={cfg.primaryColor} /></div>}
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 6px' }}>{school.name}</h1>
        {cfg.showSchoolType && <p style={{ margin: '0 0 10px', fontSize: '11px', opacity: 0.8 }}>{school.type} SCHOOL / ÉCOLE {school.type}</p>}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.4)', paddingTop: '10px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>{cfg.reportTitle}</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '16px', border: `1px solid ${cfg.primaryColor}`, padding: '10px' }}>
        {[['Nom / Name', student.name], ['Matricule / ID', student.studentId], ['Classe / Class', student.classLevel], ['Tuteur / Guardian', student.guardianName || '—'], ['Terme / Term', term.name], ['Session / Year', term.session]].map(([k, v]) => (
          <div key={k} style={{ padding: '2px 0' }}><span style={{ fontWeight: 'bold' }}>{k}:</span> {v}</div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>MATIÈRE / SUBJECT</th>
            {cfg.showSeq1 && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Seq.1</th>}
            {cfg.showSeq2 && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Seq.2</th>}
            <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>MOY / Avg</th>
            {cfg.showGrade && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>NOTE / Grade</th>}
            {cfg.showRemarks && <th style={{ padding: '7px 10px', textAlign: 'left' }}>OBS / Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.05)`, borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 10px', borderRight: '1px solid #e5e7eb' }}>{s.name}</td>
                {cfg.showSeq1 && <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>{e?.seq2Score ?? '—'}</td>}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #e5e7eb' }}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor, borderRight: '1px solid #e5e7eb' }}>{e?.grade || '—'}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555' }}>{e?.remarks || '—'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '8px', marginBottom: '16px' }}>
        {[
          { fr: 'Score Total', en: 'Total Score', val: total },
          cfg.showAverage && { fr: 'Moyenne', en: 'Average', val: `${average.toFixed(1)}` },
          cfg.showPosition && { fr: 'Rang', en: 'Position', val: position != null ? `${position}` : '—' },
        ].filter(Boolean).map((item: any) => (
          <div key={item.en} style={{ border: `2px solid ${cfg.primaryColor}`, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.val}</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{item.fr} / {item.en}</div>
          </div>
        ))}
      </div>

      {cfg.showGeneralRemarks && (
        <div style={{ border: `1px solid ${cfg.primaryColor}`, padding: '10px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: cfg.primaryColor }}>Observations / General Remarks</div>
          <div style={{ minHeight: '32px' }}>{generalRemarks || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '20px', marginTop: '32px' }}>
          {sigLabels.map(([fr, en]) => (
            <div key={en} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #111', height: '40px', marginBottom: '5px' }} />
              <div style={{ fontSize: '10px', color: '#444', lineHeight: '1.4' }}>{fr}<br />{en}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.footerText && (
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '11px', color: cfg.primaryColor, fontStyle: 'italic', borderTop: `1px solid ${cfg.primaryColor}`, paddingTop: '8px' }}>
          {cfg.footerText}
        </div>
      )}
    </div>
  )
}

// ─── Modern ───────────────────────────────────────────────────────────────────
function Modern({ school, student, term, subjects, entries, generalRemarks, average, position, cfg }: any) {
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher",
    cfg.showPrincipalSig && cfg.principalTitle,
    cfg.showParentSig && "Parent / Guardian",
  ].filter(Boolean) as string[]

  const infoItems = [
    { label: 'Name', value: student.name },
    { label: 'ID', value: student.studentId },
    { label: 'Class', value: student.classLevel },
    { label: 'Term', value: `${term.name} — ${term.session}` },
    { label: 'Guardian', value: student.guardianName || '—' },
  ]

  return (
    <div id="report-card-printable" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: '800px', margin: '0 auto', color: '#1f2937', fontSize: '13px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ backgroundColor: cfg.primaryColor, padding: '28px 40px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        {school.logo && <Logo url={school.logo} size={52} color={cfg.primaryColor} />}
        <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{school.name}</h1>
        <p style={{ margin: '0', fontSize: '13px', opacity: 0.8, letterSpacing: '2px', textTransform: 'uppercase' }}>{cfg.reportTitle}</p>
        </div>
      </div>

      <div style={{ padding: '20px 40px', backgroundColor: `rgba(${rgb},0.06)`, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {infoItems.map(({ label, value }) => (
          <div key={label} style={{ backgroundColor: 'transparent', border: `1px solid rgba(${rgb},0.2)`, borderRadius: '20px', padding: '4px 12px', fontSize: '12px' }}>
            <span style={{ color: '#9ca3af' }}>{label}: </span>
            <span style={{ fontWeight: '600' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${cfg.primaryColor}` }}>
              <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Subject</th>
              {cfg.showSeq1 && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Seq 1</th>}
              {cfg.showSeq2 && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Seq 2</th>}
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Score</th>
              {cfg.showGrade && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Grade</th>}
              {cfg.showRemarks && <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>Remarks</th>}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s: PrintSubject) => {
              const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '9px 0', fontWeight: '500' }}>{s.name}</td>
                  {cfg.showSeq1 && <td style={{ padding: '9px 8px', textAlign: 'center', color: '#6b7280' }}>{e?.seq1Score ?? '—'}</td>}
                  {cfg.showSeq2 && <td style={{ padding: '9px 8px', textAlign: 'center', color: '#6b7280' }}>{e?.seq2Score ?? '—'}</td>}
                  <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: '700', color: cfg.primaryColor }}>{e?.score ?? 0}</td>
                  {cfg.showGrade && <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                    <span style={{ backgroundColor: `rgba(${rgb},0.1)`, color: cfg.primaryColor, borderRadius: '4px', padding: '2px 10px', fontWeight: '600', fontSize: '12px' }}>{e?.grade || '—'}</span>
                  </td>}
                  {cfg.showRemarks && <td style={{ padding: '9px 0', color: '#6b7280', fontSize: '12px' }}>{e?.remarks || '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total Score', value: total },
            cfg.showAverage && { label: 'Average', value: `${average.toFixed(1)}` },
            cfg.showPosition && { label: 'Position', value: position != null ? `#${position}` : '—' },
          ].filter(Boolean).map((item: any) => (
            <div key={item.label} style={{ backgroundColor: `rgba(${rgb},0.08)`, borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: cfg.primaryColor }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {cfg.showGeneralRemarks && (
          <div style={{ backgroundColor: 'transparent', borderRadius: '8px', padding: '14px', marginBottom: '24px', borderLeft: `3px solid ${cfg.primaryColor}` }}>
            <div style={{ fontWeight: '600', marginBottom: '5px', color: cfg.primaryColor, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>General Remarks</div>
            <div style={{ color: '#374151', minHeight: '28px' }}>{generalRemarks || '—'}</div>
          </div>
        )}

        {sigLabels.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '20px', marginTop: '32px' }}>
            {sigLabels.map((label) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: `2px solid ${cfg.primaryColor}`, height: '40px', marginBottom: '6px' }} />
                <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {cfg.footerText && (
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>{cfg.footerText}</div>
        )}
      </div>
    </div>
  )
}

// ─── Official ─────────────────────────────────────────────────────────────────
function Official({ school, student, term, subjects, entries, generalRemarks, average, position, cfg }: any) {
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const border = `2px solid ${cfg.primaryColor}`
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher's Signature",
    cfg.showPrincipalSig && `${cfg.principalTitle}'s Signature`,
    cfg.showParentSig && "Parent / Guardian's Signature",
  ].filter(Boolean) as string[]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Times New Roman, serif', padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '13px', border: `3px double ${cfg.primaryColor}`, position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', borderBottom: border, paddingBottom: '16px', marginBottom: '16px' }}>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 4px', fontSize: '11px', fontStyle: 'italic', color: '#555' }}>{cfg.schoolSubtitle}</p>}
        {school.logo ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo url={school.logo} size={64} color={cfg.primaryColor} /></div>
        ) : (
          <div style={{ width: '60px', height: '60px', border: `1px solid ${cfg.primaryColor}`, borderRadius: '50%', margin: '6px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: cfg.primaryColor }}>SEAL</div>
        )}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '6px 0 2px', textTransform: 'uppercase', letterSpacing: '2px' }}>{school.name}</h1>
        {cfg.showSchoolType && <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#555' }}>{school.type} School</p>}
        <div style={{ border: border, display: 'inline-block', padding: '4px 24px', margin: '6px 0 0' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 'bold', margin: 0, letterSpacing: '2px', textTransform: 'uppercase' }}>{cfg.reportTitle}</h2>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <tbody>
          {[['Student Name', student.name, 'Student ID', student.studentId], ['Class', student.classLevel, 'Guardian', student.guardianName || '—'], ['Term', term.name, 'Session', term.session]].map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '5px 10px', fontWeight: 'bold', width: '20%', border, backgroundColor: `rgba(${rgb},0.05)` }}>{row[0]}</td>
              <td style={{ padding: '5px 10px', width: '30%', border }}>{row[1]}</td>
              <td style={{ padding: '5px 10px', fontWeight: 'bold', width: '20%', border, backgroundColor: `rgba(${rgb},0.05)` }}>{row[2]}</td>
              <td style={{ padding: '5px 10px', width: '30%', border }}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>Subject</th>
            {cfg.showSeq1 && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>Seq. 1</th>}
            {cfg.showSeq2 && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>Seq. 2</th>}
            <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>Score</th>
            {cfg.showGrade && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>Grade</th>}
            {cfg.showRemarks && <th style={{ padding: '7px 10px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                <td style={{ padding: '6px 10px', border }}>{s.name}</td>
                {cfg.showSeq1 && <td style={{ padding: '6px 8px', textAlign: 'center', border }}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={{ padding: '6px 8px', textAlign: 'center', border }}>{e?.seq2Score ?? '—'}</td>}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{e?.grade || '—'}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555', border }}>{e?.remarks || '—'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <tbody>
          <tr>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', width: '33%', border, backgroundColor: `rgba(${rgb},0.05)` }}>Total Score</td>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{total}</td>
            {cfg.showAverage && <>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', border, backgroundColor: `rgba(${rgb},0.05)` }}>Average</td>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{average.toFixed(1)}</td>
            </>}
            {cfg.showPosition && <>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', border, backgroundColor: `rgba(${rgb},0.05)` }}>Position</td>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{position != null ? position : '—'}</td>
            </>}
          </tr>
        </tbody>
      </table>

      {cfg.showGeneralRemarks && (
        <div style={{ border, padding: '10px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px' }}>General Remarks / Observations Générales</div>
          <div style={{ minHeight: '36px' }}>{generalRemarks || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '16px', marginTop: '36px' }}>
          {sigLabels.map((label) => (
            <div key={label} style={{ textAlign: 'center', border, padding: '8px' }}>
              <div style={{ height: '40px', marginBottom: '6px', borderBottom: '1px solid #888' }} />
              <div style={{ fontSize: '11px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.footerText && (
        <div style={{ marginTop: '20px', borderTop: border, paddingTop: '8px', textAlign: 'center', fontSize: '11px', fontStyle: 'italic' }}>
          {cfg.footerText}
        </div>
      )}
    </div>
  )
}

// ─── Sections-based renderer ─────────────────────────────────────────────────
function SectionsRenderer(props: PrintableReportCardProps & { cfg: TemplateConfig }) {
  const { school, student, term, subjects, entries, generalRemarks, average, position, cfg } = props
  const sections = (cfg as any).sections as LayoutSection[]
  const color = cfg.primaryColor
  const rgb = hexToRgb(color)

  const resolveField = (field: string) => {
    const m: Record<string, string> = {
      'student.name': student.name,
      'student.studentId': student.studentId,
      'student.classLevel': student.classLevel,
      'student.guardianName': student.guardianName || '—',
      'term.name': term.name,
      'term.session': term.session,
      'school.name': school.name,
    }
    return m[field] ?? field
  }

  const resolveStat = (field: string) => {
    const total = entries.reduce((s, e) => s + e.score, 0)
    if (field === 'total')    return String(total)
    if (field === 'average')  return average.toFixed(1)
    if (field === 'position') return position != null ? ordinalPos(position) : '—'
    if (field === 'grade')    return calculateGrade((average / 20) * 100)
    return '—'
  }

  const renderSec = (sec: LayoutSection) => {
    if (sec.type === 'header') {
      const s = sec as HeaderSec
      const logoSize = s.logoSize || 60
      const logoEl = school.logo ? <Logo url={school.logo} size={logoSize} color={color} /> : null

      const textBlock = (
        <div style={{ flex: 1 }}>
          {s.showSchoolType && <p style={{ margin: '0 0 2px', fontSize: 11, color: s.schoolTypeColor || '#666', letterSpacing: 2, textTransform: 'uppercase' }}>{school.type} SCHOOL</p>}
          <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 4px', color: s.schoolNameColor || color }}>{school.name}</h1>
          {s.subtitle && <p style={{ margin: '0 0 6px', fontSize: 12, color: '#555' }} dangerouslySetInnerHTML={{ __html: s.subtitle }} />}
          <h2 style={{ fontSize: 14, fontWeight: 'bold', margin: '8px 0 0', letterSpacing: 3, color }} dangerouslySetInnerHTML={{ __html: s.reportTitle }} />
        </div>
      )

      return (
        <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 16, marginBottom: 16 }}>
          {s.showLogo && logoEl && s.logoPosition === 'center' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{logoEl}</div>
              {textBlock}
            </div>
          ) : s.showLogo && logoEl && s.logoPosition === 'right' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{textBlock}{logoEl}</div>
          ) : s.showLogo && logoEl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{logoEl}{textBlock}</div>
          ) : (
            <div style={{ textAlign: 'center' }}>{textBlock}</div>
          )}
        </div>
      )
    }

    if (sec.type === 'student_info') {
      const s = sec as StudentInfoSec
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns}, 1fr)`, gap: '5px 12px', background: `rgba(${rgb},0.05)`, padding: 12, border: `1px solid rgba(${rgb},0.25)`, marginBottom: 16, fontSize: 12 }}>
          {s.rows.map(row => (
            <div key={row.id}>
              <span style={{ fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: row.label + ':' }} />
              {' '}<span style={{ color: row.valueColor ?? undefined }}>{resolveField(row.field)}</span>
            </div>
          ))}
        </div>
      )
    }

    if (sec.type === 'marks_table') {
      const s = sec as MarksTableSec
      const hdrs = s.headers || {}
      const cc   = s.colColors || {}
      const hText = (k: string, fallback: string) => {
        const h = hdrs[k]; if (!h) return fallback
        return h.replace(/<[^>]*>/g, '') // strip any color spans for print header text
      }
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: color }}>
              {[
                { k: 'subject', fb: 'Subject', align: 'left'   as const, pad: '7px 10px' },
                ...(s.showSeq1 ? [{ k: 'seq1', fb: 'Seq 1', align: 'center' as const, pad: '7px 8px' }] : []),
                ...(s.showSeq2 ? [{ k: 'seq2', fb: 'Seq 2', align: 'center' as const, pad: '7px 8px' }] : []),
                { k: 'score',   fb: 'Score',   align: 'center' as const, pad: '7px 8px' },
                ...(s.showGrade   ? [{ k: 'grade',   fb: 'Grade',   align: 'center' as const, pad: '7px 8px'  }] : []),
                ...(s.showRemarks ? [{ k: 'remarks', fb: 'Remarks', align: 'left'   as const, pad: '7px 10px' }] : []),
              ].map(col => (
                <th key={col.k} style={{ padding: col.pad, textAlign: col.align, color: s.headerColor || '#fff' }}>
                  {hText(col.k, col.fb)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subj, i) => {
              const e = entries.find(x => x.subjectId === subj.id)
              return (
                <tr key={subj.id} style={{ background: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)`, borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 10px', color: cc.subject }}>{subj.name}</td>
                  {s.showSeq1 && <td style={{ padding: '6px 8px', textAlign: 'center', color: cc.seq1 }}>{e?.seq1Score ?? '—'}</td>}
                  {s.showSeq2 && <td style={{ padding: '6px 8px', textAlign: 'center', color: cc.seq2 }}>{e?.seq2Score ?? '—'}</td>}
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: cc.score || color }}>{e?.score ?? 0}</td>
                  {s.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: cc.grade }}>{e?.grade || '—'}</td>}
                  {s.showRemarks && <td style={{ padding: '6px 10px', color: cc.remarks || '#555' }}>{e?.remarks || '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      )
    }

    if (sec.type === 'summary') {
      const s = sec as SummarySec
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.boxes.length || 1}, 1fr)`, gap: 10, marginBottom: 16 }}>
          {s.boxes.map(box => (
            <div key={box.id} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: s.valueColor || color }}>{resolveStat(box.field)}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 3 }} dangerouslySetInnerHTML={{ __html: box.label }} />
            </div>
          ))}
        </div>
      )
    }

    if (sec.type === 'remarks') {
      const s = sec as RemarksSec
      return (
        <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 5, color }} dangerouslySetInnerHTML={{ __html: s.label }} />
          <div style={{ minHeight: 36, color: '#444' }}>{generalRemarks || '—'}</div>
        </div>
      )
    }

    if (sec.type === 'signatures') {
      const s = sec as SignaturesSec
      if (!s.lines.length) return null
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.lines.length}, 1fr)`, gap: 20, marginTop: 32, marginBottom: 16 }}>
          {s.lines.map(line => (
            <div key={line.id} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #111', height: 40, marginBottom: 5 }} />
              <div style={{ fontSize: 11, color: '#555' }} dangerouslySetInnerHTML={{ __html: line.label }} />
            </div>
          ))}
        </div>
      )
    }

    if (sec.type === 'text_block') {
      const s = sec as TextBlockSec
      return (
        <div style={{ textAlign: s.align, fontSize: 12, color: '#555', padding: '6px 0', borderTop: '1px solid #f1f5f9', marginBottom: 8 }}
          dangerouslySetInnerHTML={{ __html: s.content }}
        />
      )
    }

    if (sec.type === 'divider') {
      const s = sec as DividerSec
      return <hr style={{ border: 'none', borderTop: `1px ${s.style} ${color}`, margin: '8px 0' }} />
    }

    return null
  }

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: 40, maxWidth: 800, margin: '0 auto', color: '#111', fontSize: 13, position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      {sections.map(sec => <div key={sec.id}>{renderSec(sec)}</div>)}
    </div>
  )
}

function calculateGrade(score: number) {
  // Fallback only — real grading uses the school's custom scale
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function PrintableReportCard(props: PrintableReportCardProps) {
  const cfg: TemplateConfig = { ...DEFAULT_CONFIG, ...props.config } as TemplateConfig

  // If sections-based layout saved → use it
  if ((cfg as any).sections?.length > 0) {
    return <SectionsRenderer {...props} cfg={cfg} />
  }

  const shared = { ...props, cfg }
  if (cfg.template === 'bilingual') return <Bilingual {...shared} />
  if (cfg.template === 'modern') return <Modern {...shared} />
  if (cfg.template === 'official') return <Official {...shared} />
  return <Classic {...shared} />
}
