'use client'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getReportCardApi, saveEntriesApi, publishReportCardApi, unpublishReportCardApi, grantEditPermissionApi, revokeEditPermissionApi, updateRemarksApi, generateRemarksApi, remarkSourceLabel, getReadinessDetailApi, ReadinessDetail } from '@/lib/api/reportcards'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTeachersApi } from '@/lib/api/teachers'
import { ArrowLeft, Save, Send, CheckCircle, Printer, Sparkles } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import PrintableReportCard from '@/components/ui/PrintableReportCard'
import { getTemplateApi, TemplateConfig, TemplateName, DEFAULT_CONFIG, getDefaultLayoutForType } from '@/lib/api/reportCardTemplate'
import { getGradingScaleApi, GradeRange, ClassificationBand, DEFAULT_RANGES, DEFAULT_CLASSIFICATION_BANDS, gradePointForScore20, classificationForGpa } from '@/lib/api/gradingScale'
import { gradeFromScore } from '@/lib/grading'
import CustomSelect from '@/components/ui/CustomSelect'
import { useT } from '@/lib/i18n'

interface Subject { id: string; name: string; classLevel: string; maxScore: number; coefficient: number; credit?: number; compulsory?: boolean; term?: string | null }
interface Entry { subjectId: string; score: number; seq1Score?: number | null; seq2Score?: number | null; resitScore?: number | null; grade: string; remarks: string }
interface ReportCard {
  id: string
  status: string
  totalScore: number | null
  average: number | null
  position: number | null
  classSize?: number | null
  classAverage?: number | null
  annualAverage?: number | null
  annualPosition?: number | null
  annualClassSize?: number | null
  remarks: string | null
  remarksFr: string | null
  remarksSource: string | null
  marksEditGrantedTo: string | null
  remarksEditGrantedTo: string | null
  student: { id: string; name: string; classLevel: string; studentId: string; guardianName?: string; gender?: string }
  term: { id: string; name: string; session: string; printingEnabled?: boolean }
  school: { name: string; type: string; language?: string; logo?: string | null; email?: string; phone?: string | null; address?: string | null; website?: string | null; authorizationNumber?: string | null }
  entries: { id: string; score: number; seq1Score?: number | null; seq2Score?: number | null; resitScore?: number | null; grade: string; remarks: string; subject: { id: string; name: string } }[]
}


function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function ReportCardDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { isAuthenticated, user } = useAuthStore()
  const isAdmin = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const [readiness, setReadiness] = useState<ReadinessDetail | null>(null)
  const { toast, showToast, hideToast } = useToast()
  const tr = useT()
  const [reportCard, setReportCard] = useState<ReportCard | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [generalRemarks, setGeneralRemarks] = useState('')
  const [generalRemarksFr, setGeneralRemarksFr] = useState('')
  const [generatingRemarks, setGeneratingRemarks] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showUnpublishModal, setShowUnpublishModal] = useState(false)
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(DEFAULT_CONFIG)
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [classificationBands, setClassificationBands] = useState<ClassificationBand[]>(DEFAULT_CLASSIFICATION_BANDS)
  const [studentCgpa, setStudentCgpa] = useState<number | null>(null)
  const [subjectStats, setSubjectStats] = useState<Record<string, { min: number; avg: number; max: number }>>({})

  const [teachers, setTeachers] = useState<{ id: string; name: string; role: string }[]>([])
  const [grantMarksUserId, setGrantMarksUserId] = useState('')
  const [grantRemarksUserId, setGrantRemarksUserId] = useState('')

  const handlePrint = useCallback(() => {
    const el = document.getElementById('report-card-printable')
    if (!el) return
    const imgs = Array.from(el.getElementsByTagName('img'))
    const doPrint = () => window.print()
    if (imgs.length === 0) {
      setTimeout(doPrint, 200)
    } else {
      let done = 0
      imgs.forEach(img => {
        const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 200) }
        if (img.complete) tick()
        else { img.onload = tick; img.onerror = tick }
      })
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [rc, subjectData, tplData, scaleData, teacherData] = await Promise.all([
        getReportCardApi(String(params.id)),
        getSubjectsApi(),
        getTemplateApi().catch(() => ({ config: {} })),
        getGradingScaleApi().catch(() => ({ ranges: DEFAULT_RANGES, classificationBands: DEFAULT_CLASSIFICATION_BANDS, legendRows: [] })),
        getTeachersApi().catch(() => ({ teachers: [] })),
      ])
      setTeachers((teacherData.teachers ?? []).filter((t: any) => ['CLASS_TEACHER', 'CLASS_MASTER'].includes(t.role)))
      if (scaleData.ranges.length > 0) setGradingRanges(scaleData.ranges)
      if (scaleData.classificationBands?.length > 0) setClassificationBands(scaleData.classificationBands)
      if (tplData.config && Object.keys(tplData.config).length > 0) {
        const { TEMPLATE_DEFAULTS } = await import('@/lib/api/reportCardTemplate')
        const saved = tplData.config as Partial<TemplateConfig>
        const base = TEMPLATE_DEFAULTS[(saved.template ?? 'classic') as TemplateName]
        setTemplateConfig({ ...base, ...saved } as TemplateConfig)
      } else {
        // No saved design → use the section-type default (university gets the GPA transcript).
        setTemplateConfig(getDefaultLayoutForType(rc.school?.type) as TemplateConfig)
      }
      if (rc.cgpa != null) setStudentCgpa(rc.cgpa)
      setReportCard(rc)
      if (rc.subjectStats) setSubjectStats(rc.subjectStats)
      setGeneralRemarks(rc.remarks || '')
      setGeneralRemarksFr(rc.remarksFr || '')
      if (isAdmin) getReadinessDetailApi(String(params.id)).then(setReadiness).catch(() => {})
      // Show compulsory subjects + optional ones only when the student took them
      // (i.e. a report-card entry exists). Optional-not-taken are omitted.
      // A course scoped to one semester (university) only counts for that
      // semester; a subject with no term (primary/secondary) always counts.
      const classSubjects = subjectData.subjects.filter(
        (s: Subject) => s.classLevel === rc.student.classLevel
          && (s.term == null || s.term === rc.term.name)
          && (s.compulsory !== false || rc.entries.some((e: any) => e.subject.id === s.id))
      )
      setSubjects(classSubjects)
      const existingEntries = classSubjects.map((s: Subject) => {
        const existing = rc.entries.find((e: any) => e.subject.id === s.id)
        return {
          subjectId: s.id,
          score: existing?.score || 0,
          seq1Score: existing?.seq1Score ?? null,
          seq2Score: existing?.seq2Score ?? null,
          resitScore: existing?.resitScore ?? null,
          grade: existing?.grade || '',
          remarks: existing?.remarks || ''
        }
      })
      setEntries(existingEntries)
    } catch {
      showToast(tr('Failed to load report card'), 'error')
    } finally {
      setLoading(false)
    }
  }, [params.id, showToast])

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else fetchData()
  }, [isAuthenticated, fetchData, router])

  const handleScoreChange = (subjectId: string, score: number) => {
    const subject = subjects.find(s => s.id === subjectId)
    const maxScore = subject?.maxScore ?? 20
    setEntries(prev => prev.map(e =>
      e.subjectId === subjectId ? { ...e, score, grade: gradeFromScore(score, maxScore, gradingRanges).grade } : e
    ))
  }

  const handleRemarksChange = (subjectId: string, remarks: string) => {
    setEntries(prev => prev.map(e =>
      e.subjectId === subjectId ? { ...e, remarks } : e
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isClassMaster || canAdminEditRemarks) {
        if (reportCard?.school.language === 'FR') await updateRemarksApi(String(params.id), undefined, generalRemarksFr)
        else await updateRemarksApi(String(params.id), generalRemarks)
      } else {
        await saveEntriesApi(String(params.id), { entries })
      }
      showToast(tr('Saved successfully'))
      fetchData()
    } catch {
      showToast(tr('Failed to save'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateRemarks = async () => {
    setGeneratingRemarks(true)
    try {
      const result = await generateRemarksApi(String(params.id))
      setGeneralRemarks(result.remarks || '')
      setGeneralRemarksFr(result.remarksFr || '')
      showToast(result.aiAvailable ? tr('AI draft ready — review and edit before saving') : tr('AI unavailable — inserted a default you can edit'), result.aiAvailable ? 'success' : 'error')
    } catch {
      showToast(tr('Failed to generate remarks'), 'error')
    } finally {
      setGeneratingRemarks(false)
    }
  }

  const handlePublishConfirm = async () => {
    setShowPublishModal(false)
    setPublishing(true)
    try {
      await publishReportCardApi(String(params.id))
      showToast(tr('Report card published successfully!'))
      fetchData()
    } catch {
      showToast(tr('Failed to publish report card'), 'error')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublishConfirm = async () => {
    setShowUnpublishModal(false)
    setUnpublishing(true)
    try {
      await unpublishReportCardApi(String(params.id))
      showToast(tr('Report card unpublished — teachers can now edit marks.'))
      fetchData()
    } catch {
      showToast(tr('Failed to unpublish report card'), 'error')
    } finally {
      setUnpublishing(false)
    }
  }

  const handleGrantPermission = async (type: 'marks' | 'remarks') => {
    const userId = type === 'marks' ? grantMarksUserId : grantRemarksUserId
    if (!userId) { showToast(tr('Please select a teacher first'), 'error'); return }
    try {
      await grantEditPermissionApi(String(params.id), type, userId)
      const name = teachers.find(t => t.id === userId)?.name ?? 'teacher'
      showToast(`${tr('Edit permission granted to')} ${name}.`)
      if (type === 'marks') setGrantMarksUserId('')
      else setGrantRemarksUserId('')
      fetchData()
    } catch {
      showToast(tr('Failed to grant permission'), 'error')
    }
  }

  const handleRevokePermission = async (type: 'marks' | 'remarks') => {
    try {
      await revokeEditPermissionApi(String(params.id), type)
      showToast(tr('Permission revoked.'))
      fetchData()
    } catch {
      showToast(tr('Failed to revoke permission'), 'error')
    }
  }

  const avgMaxScore = subjects[0]?.maxScore ?? 20
  const average = (() => {
    if (!subjects.length) return 0
    let totalWeighted = 0, totalCoeff = 0
    for (const s of subjects) {
      const entry = entries.find(e => e.subjectId === s.id)
      // Skip unless BOTH sequences are filled — API only sets score when seq1 AND seq2 are non-null
      if (!entry || entry.seq1Score == null || entry.seq2Score == null) continue
      const coeff = s.coefficient ?? 1
      totalWeighted += (entry.score ?? 0) * coeff
      totalCoeff += coeff
    }
    return totalCoeff > 0 ? totalWeighted / totalCoeff : 0
  })()

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading report card...</div>
  if (!reportCard) return <div className="text-center py-12 text-muted-foreground text-sm">Report card not found.</div>

  const isUniversity = reportCard.school.type === 'UNIVERSITY'

  // Semester GPA: Σ(gradePoint × credit) / Σ(credit) — mirrors PrintableReportCard logic
  const semGpaInfo = (() => {
    let pts = 0, cr = 0
    for (const subj of subjects) {
      const e = entries.find(x => x.subjectId === subj.id)
      if (e?.score == null) continue
      const gp = gradePointForScore20(e.score, gradingRanges)
      if (gp == null) continue
      const c = subj.credit ?? 0
      pts += gp * c; cr += c
    }
    return { gpa: cr > 0 ? pts / cr : 0, credits: cr }
  })()
  const cgpa = studentCgpa ?? semGpaInfo.gpa

  // Publish readiness checks — prefer the backend's readiness detail (admin-only)
  // once it loads, since it also catches subjects with zero entries at all, not
  // just entries with a missing sequence score. Falls back to the local, weaker
  // check for non-admins (who never fetch readiness) so their remarks-edit gate
  // still works.
  const localSeqsFilled = entries.length > 0 && entries.every(e => e.seq1Score != null && e.seq2Score != null)
  const allSeqsFilled = readiness ? readiness.allSeqsFilled : localSeqsFilled
  const hasRemarks = !!(reportCard.remarks?.trim() || reportCard.remarksFr?.trim())
  // Positions are class-relative — every other active student in this class + term
  // must also be complete (or already published) before this one can publish.
  const classReady = readiness ? readiness.otherStudentsBlocking === 0 : false
  const canPublish = allSeqsFilled && hasRemarks && classReady
  // Class master can only give remarks once ALL sequences for this report card are filled
  const canEditRemarks = isClassMaster && allSeqsFilled && (reportCard.status === 'DRAFT' || reportCard.remarksEditGrantedTo === user?.id)
  // Admin / VP can also write the general remarks — once every offered subject is
  // marked (same gate as the class master).
  const noClassMaster = readiness ? !readiness.classMaster : false
  const canAdminEditRemarks = isAdmin && allSeqsFilled && reportCard.status === 'DRAFT'

  return (
    <div>
<div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/report-cards')}
          className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{reportCard.student.name}</h2>
          <p className="text-muted-foreground text-sm truncate">{reportCard.term.name} — {reportCard.term.session} · {reportCard.student.classLevel}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {reportCard.status === 'PUBLISHED' ? (
            <div className="flex items-center gap-2">
              {/* Status badge */}
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-md">
                <CheckCircle size={12} /> {tr('Published')}
              </span>

              {isAdmin && (
                <>
                  <button
                    onClick={() => setShowUnpublishModal(true)}
                    disabled={unpublishing}
                    className="text-xs border border-border text-muted-foreground px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                  >
                    {unpublishing ? tr('Unpublishing…') : tr('Unpublish')}
                  </button>

                  {/* Grant permissions */}
                  <div className="flex items-center gap-2 border-l border-border pl-2">
                    {/* Marks */}
                    {reportCard.marksEditGrantedTo ? (
                      <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5">
                        <span className="text-xs text-primary font-medium">{tr('Marks')} → {teachers.find(t => t.id === reportCard.marksEditGrantedTo)?.name?.split(' ')[0]}</span>
                        <button onClick={() => handleRevokePermission('marks')} className="text-primary/60 hover:text-destructive text-xs leading-none">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-32">
                          <CustomSelect
                            compact
                            value={grantMarksUserId}
                            onChange={setGrantMarksUserId}
                            placeholder={tr('Marks to…')}
                            options={teachers.filter(t => ['CLASS_TEACHER','CLASS_MASTER'].includes(t.role)).map(t => ({ value: t.id, label: t.name, sub: t.role === 'CLASS_MASTER' ? tr('Class Master') : tr('Class Teacher') }))}
                          />
                        </div>
                        <button onClick={() => handleGrantPermission('marks')} disabled={!grantMarksUserId}
                          className="text-xs bg-primary hover:bg-[#d63429] disabled:opacity-40 text-primary-foreground px-2 py-1 rounded-md transition-colors whitespace-nowrap">
                          {tr('Grant')}
                        </button>
                      </div>
                    )}

                    {/* Remarks */}
                    {reportCard.remarksEditGrantedTo ? (
                      <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5">
                        <span className="text-xs text-primary font-medium">{tr('Remarks')} → {teachers.find(t => t.id === reportCard.remarksEditGrantedTo)?.name?.split(' ')[0]}</span>
                        <button onClick={() => handleRevokePermission('remarks')} className="text-primary/60 hover:text-destructive text-xs leading-none">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-32">
                          <CustomSelect
                            compact
                            value={grantRemarksUserId}
                            onChange={setGrantRemarksUserId}
                            placeholder={tr('Remarks to…')}
                            options={teachers.filter(t => t.role === 'CLASS_MASTER').map(t => ({ value: t.id, label: t.name, sub: tr('Class Master') }))}
                          />
                        </div>
                        <button onClick={() => handleGrantPermission('remarks')} disabled={!grantRemarksUserId}
                          className="text-xs bg-primary hover:bg-[#d63429] disabled:opacity-40 text-primary-foreground px-2 py-1 rounded-md transition-colors whitespace-nowrap">
                          {tr('Grant')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              {isAdmin && (
                reportCard.term.printingEnabled === false ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted border border-border px-3 py-2 rounded-lg" title="Printing has been disabled for this term by your administrator">
                    <Printer size={14} /> {tr('Printing disabled')}
                  </span>
                ) : (
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition"
                  >
                    <Printer size={14} /> {tr('Print / Save PDF')}
                  </button>
                )
              )}
            </div>
          ) : (
            <>
              {(isClassMaster || canAdminEditRemarks) && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted disabled:opacity-50 transition"
                >
                  <Save size={14} />
                  {saving ? tr('Saving...') : tr('Save Remarks')}
                </button>
              )}
              {isAdmin && (
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={() => setShowPublishModal(true)}
                    disabled={publishing || !canPublish}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={14} />
                    {publishing ? tr('Publishing...') : tr('Publish')}
                  </button>
                  {/* Readiness checklist — only shown when button is blocked */}
                  {!canPublish && (
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        allSeqsFilled ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'
                      }`}>
                        {allSeqsFilled ? '✓' : '✗'} {tr('Sequences')}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        hasRemarks ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'
                      }`}>
                        {hasRemarks ? '✓' : '✗'} {tr('Remarks')}
                      </span>
                      {readiness && (
                        <span
                          title={!classReady ? readiness.otherStudentsBlockingNames.join(', ') : undefined}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            classReady ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'
                          }`}>
                          {classReady ? '✓' : '✗'} {tr('Whole class')}
                          {!classReady && ` (${readiness.otherStudentsBlocking})`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {isUniversity ? (
          <>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{subjects.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Courses')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{semGpaInfo.gpa.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Semester GPA')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{cgpa.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Cumulative GPA')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-lg font-bold text-foreground leading-tight">{classificationForGpa(cgpa, classificationBands)}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Classification')}</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{subjects.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Subjects')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{average.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Terms Average')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{gradeFromScore(average, avgMaxScore, gradingRanges).grade}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Overall Grade')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{reportCard.position != null ? `${ordinal(reportCard.position)}${reportCard.classSize ? `/${reportCard.classSize}` : ''}` : '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr('Class Position')}</p>
            </div>
            {reportCard.classAverage != null && (
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{reportCard.classAverage.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">{tr('Class Average')}</p>
              </div>
            )}
            {reportCard.annualAverage != null && (
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{reportCard.annualAverage.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-1">{tr('Annual Average')}</p>
              </div>
            )}
            {reportCard.annualPosition != null && (
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{ordinal(reportCard.annualPosition)}{reportCard.annualClassSize ? `/${reportCard.annualClassSize}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-1">{tr('Annual Position')}</p>
              </div>
            )}
          </>
        )}
      </div>


      {subjects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <p className="text-muted-foreground text-sm">
            {isUniversity ? tr('No courses for') : tr('No subjects for')} <strong>{reportCard.student.classLevel}</strong>.
          </p>
          <button onClick={() => router.push('/subjects')} className="mt-3 text-primary text-sm hover:underline">
            {isUniversity ? tr('Go to Courses →') : tr('Go to Subjects →')}
          </button>
        </div>
      ) : (
        <>
          <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
            <div className="px-4 py-3 bg-muted border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{isUniversity ? tr('Course Scores') : tr('Subject Scores')}</h3>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
              <thead className="border-b border-gray-100 dark:border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{isUniversity ? tr('Course') : tr('Subject')}</th>
                  {isUniversity ? (
                    <>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">CA / 30</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Exam / 70</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Total / 100</th>
                    </>
                  ) : (
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{tr('Score')}</th>
                  )}
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{isUniversity ? tr('Credit') : tr('Coeff')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{tr('Grade')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{tr('Remarks')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subjects.map((subject) => {
                  const entry = entries.find(e => e.subjectId === subject.id)
                  const bothFilled = entry?.seq1Score != null && entry?.seq2Score != null
                  return (
                    <tr key={subject.id} className="hover:bg-muted dark:hover:bg-muted">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{subject.name}</td>
                      {isUniversity ? (
                        <>
                          <td className="px-4 py-3">
                            {entry?.seq1Score != null
                              ? <span className="text-sm text-foreground">{entry.seq1Score}<span className="text-muted-foreground text-xs ml-1">/30</span></span>
                              : <span className="text-sm text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {entry?.seq2Score != null
                              ? <span className="text-sm text-foreground">{entry.seq2Score}<span className="text-muted-foreground text-xs ml-1">/70</span></span>
                              : <span className="text-sm text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {bothFilled
                              ? <span className="text-sm font-semibold text-foreground">{entry!.score ?? 0}<span className="text-muted-foreground text-xs ml-1 font-normal">/100</span></span>
                              : <span className="text-sm text-muted-foreground">—</span>}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3">
                          {!bothFilled
                            ? <span className="text-sm text-muted-foreground">—</span>
                            : <span className="text-sm text-foreground">{entry?.score ?? 0}<span className="text-muted-foreground text-xs ml-1">/{subject.maxScore}</span></span>
                          }
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          {isUniversity ? (subject.credit ?? 0) : `×${subject.coefficient ?? 1}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {!bothFilled
                          ? <span className="text-sm text-muted-foreground">—</span>
                          : (() => {
                              const gr = gradeFromScore(entry?.score || 0, subject.maxScore, gradingRanges)
                              return (
                                <span className="text-xs font-bold px-2 py-1 rounded"
                                  style={{ backgroundColor: gr.bgColor, color: gr.color }}>
                                  {gr.grade}
                                </span>
                              )
                            })()
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                          {!bothFilled ? '—' : gradeFromScore(entry?.score || 0, subject.maxScore, gradingRanges).remark || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>

          {/* Admin attribution panel — who is blocking this card */}
          {isAdmin && readiness && (readiness.missingSubjects.length > 0 || readiness.missingRemarks) && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">{tr('Action Required')}</p>
              {readiness.missingSubjects.map(s => (
                <div key={s.subjectId} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {s.teacher
                    ? <span className="text-foreground"><span className="font-medium">{s.teacher.name}</span> {tr('has not filled marks for')} <span className="font-medium">{s.subjectName}</span></span>
                    : <span className="text-foreground"><span className="font-medium">{s.subjectName}</span> {tr('has no teacher assigned')}</span>
                  }
                </div>
              ))}
              {readiness.missingRemarks && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  {readiness.classMaster
                    ? <span className="text-foreground">{tr('Class Master')} <span className="font-medium">{readiness.classMaster.name}</span> {tr('has not written general remarks')}</span>
                    : <span className="text-foreground">{tr('General remarks have not been written yet —')} <span className="font-medium">{tr('admin / vice-principal')}</span> {tr('can add them below')}</span>
                  }
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <label className="block text-sm font-medium text-foreground">{tr('General Remarks')}</label>
              <div className="flex items-center gap-2">
                {(() => {
                  const prov = remarkSourceLabel(reportCard.remarksSource)
                  if (!prov) return null
                  const tone = prov.tone === 'ai'
                    ? 'text-violet-700 bg-violet-100 border-violet-200'
                    : prov.tone === 'edited'
                      ? 'text-blue-700 bg-blue-100 border-blue-200'
                      : 'text-emerald-700 bg-emerald-100 border-emerald-200'
                  return (
                    <span className={`inline-flex items-center gap-1 text-[11px] border px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`} title={tr('How this remark was produced')}>
                      {prov.tone !== 'manual' && <Sparkles size={10} />}{tr(prov.text)}
                    </span>
                  )
                })()}
                <span className="text-xs text-muted-foreground italic">{noClassMaster ? tr('No class master — set by admin / VP') : tr('Set by class master')}</span>
              </div>
            </div>
            {(() => { const isFr = reportCard.school.language === 'FR'; return (canEditRemarks || canAdminEditRemarks) ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">{tr('Average:')} {reportCard.average != null ? reportCard.average.toFixed(1) : '—'}/20 · {tr('Language:')} {isFr ? tr('French') : tr('English')}</span>
                  <button
                    onClick={handleGenerateRemarks}
                    disabled={generatingRemarks || reportCard.average == null}
                    title={reportCard.average == null ? tr('Average not computed yet — fill all sequences first') : tr('Generate a draft from the average')}
                    className="flex items-center gap-1.5 text-xs border border-primary/30 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/10 disabled:opacity-50 transition">
                    <Sparkles size={12} /> {generatingRemarks ? tr('Generating…') : tr('Generate with AI')}
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder={isFr ? "Appréciation générale sur les résultats de l'élève..." : "Overall remarks about the student's performance..."}
                  value={isFr ? generalRemarksFr : generalRemarks}
                  onChange={(e) => isFr ? setGeneralRemarksFr(e.target.value) : setGeneralRemarks(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground mt-2">{tr('AI drafts are a starting point — review and edit before saving.')}</p>
              </>
            ) : (isClassMaster || isAdmin) && !allSeqsFilled && reportCard.status === 'DRAFT' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700 font-medium">{tr('Cannot add remarks yet')}</p>
                <p className="text-xs text-amber-600 mt-0.5">{tr('All subject sequences must be filled before you can add general remarks.')}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{(isFr ? reportCard.remarksFr : reportCard.remarks) || <span className="italic">{tr('No remarks yet')}</span>}</p>
            ) })()}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={showPublishModal}
        title={tr('Publish Report Card')}
        message={`${tr('Are you sure you want to publish this report card? It will become visible to students and parents.')}`}
        confirmLabel={tr('Yes, Publish')}
        confirmColor="green"
        onConfirm={handlePublishConfirm}
        onCancel={() => setShowPublishModal(false)}
      />

      <ConfirmModal
        isOpen={showUnpublishModal}
        title={tr('Unpublish Report Card')}
        message={`${tr('This will unlock the report card so teachers can edit marks and remarks again. Continue?')}`}
        confirmLabel={tr('Yes, Unpublish')}
        confirmColor="red"
        onConfirm={handleUnpublishConfirm}
        onCancel={() => setShowUnpublishModal(false)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {createPortal(
        <div className="rc-print-portal">
          <PrintableReportCard
            school={reportCard.school}
            student={reportCard.student}
            term={reportCard.term}
            subjects={subjects}
            entries={entries}
            generalRemarks={generalRemarks}
            generalRemarksFr={generalRemarksFr}
            average={average}
            position={reportCard.position}
            classSize={reportCard.classSize ?? undefined}
            classAverage={reportCard.classAverage ?? undefined}
            annualAverage={reportCard.annualAverage ?? undefined}
            annualPosition={reportCard.annualPosition ?? undefined}
            annualClassSize={reportCard.annualClassSize ?? undefined}
            config={templateConfig}
            gradeBands={gradingRanges}
            classificationBands={classificationBands}
            cgpa={studentCgpa ?? undefined}
            subjectStats={subjectStats}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
