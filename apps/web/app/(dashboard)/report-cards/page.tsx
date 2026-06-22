'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getReportCardsApi, createReportCardApi, deleteReportCardApi, getCurrentTermApi, getClassLevelsApi, getClassOverviewApi, bulkPublishApi, getClassReadinessApi, ClassReadiness, getMarksExportApi, MarksExportStudent } from '@/lib/api/reportcards'
import { getStudentsApi } from '@/lib/api/students'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTermsApi } from '@/lib/api/terms'
import { buildCsv, saveCsv, datedFilename } from '@/lib/csv'
import { downloadZip } from '@/lib/zip'
import { FileText, Plus, Trash2, Eye, X, CheckCircle, Clock, Printer, Send, AlertTriangle, List, ChevronDown, Download } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import PrintableReportCard, { PrintEntry } from '@/components/ui/PrintableReportCard'
import DesktopOnly from '@/components/ui/DesktopOnly'
import { getTemplateApi, TEMPLATE_DEFAULTS, TemplateName, TemplateConfig, getDefaultLayoutForType } from '@/lib/api/reportCardTemplate'
import { printClassList } from '@/lib/classListDocument'
import { getClassListTemplateApi, mergeClassListConfig } from '@/lib/api/classListTemplate'
import { useT } from '@/lib/i18n'

interface RawEntry {
  id: string; score: number; seq1Score?: number | null; seq2Score?: number | null
  grade: string; remarks: string; subject: { id: string; name: string }
}
interface RawRC {
  id: string; status: string; remarks?: string; remarksFr?: string | null; average?: number | null; position?: number | null
  student: { id: string; name: string; studentId: string; classLevel: string; guardianName?: string }
  term: { id: string; name: string; session: string }
  entries: RawEntry[]
}

interface PrintJob { cards: RawRC[]; config: TemplateConfig }

function openPopupPrint(cards: RawRC[], config: TemplateConfig, schoolName: string, schoolType: string, schoolLogo: string | null) {
  const origin = window.location.origin
  const html = cards.map((rc, i) => {
    const el = document.getElementById(`rc-print-${rc.id}`)
    if (!el) return ''
    const raw = el.outerHTML.replace(/\bsrc="(\/[^"]+)"/g, `src="${origin}$1"`)
    return i < cards.length - 1 ? `<div style="page-break-after:always">${raw}</div>` : raw
  }).join('')

  const pw = window.open('', 'classPrint', 'width=900,height=700')
  if (!pw) { alert('Allow popups for this site to enable printing.'); return }

  pw.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Report Cards</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  @page { margin: 0; size: A4 portrait; }
  * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
  tbody tr, tbody td { background-color: transparent !important; }
</style>
</head>
<body>${html}</body>
</html>`)
  pw.document.close()
  pw.focus()
  const imgs = Array.from(pw.document.images)
  const doPrint = () => { pw.print(); pw.addEventListener('afterprint', () => pw.close()) }
  if (imgs.length === 0) { setTimeout(doPrint, 250) }
  else {
    let done = 0
    imgs.forEach(img => {
      const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 250) }
      if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
    })
  }
}

interface ReportCard {
  id: string
  status: string
  totalScore: number | null
  average: number | null
  student: { id: string; name: string; classLevel: string; studentId: string }
  term: { id: string; name: string; session: string }
  entries: { id: string; score: number; grade: string; subject: { name: string } }[]
}
interface Student { id: string; name: string; classLevel: string; studentId: string }
interface Term { id: string; name: string; session: string; isCurrent: boolean }

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']

// ── Teacher/Admin class-based view ────────────────────────────────────────────────
function TeacherClassesView() {
  const tr = useT()
  const router = useRouter()
  const { school, user } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const isAdmin = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const [term, setTerm] = useState<{ id: string; name: string; session: string } | null>(null)
  const [classes, setClasses] = useState<{ classLevel: string; total: number; filled: number; published: number; hasSubjects: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printJob, setPrintJob] = useState<PrintJob | null>(null)
  const [printing, setPrinting] = useState(false)
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<{ classLevel: string; published: number; skipped: number; issues: { student: string; reason: string }[] } | null>(null)

  useEffect(() => {
    if (!printJob) return
    const timer = setTimeout(() => {
      openPopupPrint(printJob.cards, printJob.config, school?.name ?? '', school?.type ?? 'SECONDARY', school?.logo ?? null)
      setPrintJob(null)
      setPrinting(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [printJob])

  const handleClassPrint = async (classLevel: string, termId: string) => {
    setPrinting(true)
    try {
      const [rcData, tplData] = await Promise.all([
        getReportCardsApi({ termId, classLevel }),
        getTemplateApi().catch(() => ({ config: {} })),
      ])
      const published: RawRC[] = (rcData.reportCards as RawRC[]).filter(rc => rc.status === 'PUBLISHED')
      if (!published.length) { setPrinting(false); return }
      const saved = tplData.config as Partial<TemplateConfig> | undefined
      const base = TEMPLATE_DEFAULTS[((saved?.template as TemplateName) ?? 'classic')]
      const config = saved && Object.keys(saved).length > 0 ? { ...base, ...saved } as TemplateConfig : getDefaultLayoutForType(school?.type)
      setPrintJob({ cards: published, config })
    } catch {
      setPrinting(false)
    }
  }

  const handleBulkPublish = async (classLevel: string) => {
    if (!term) return
    setBulkPublishing(classLevel)
    try {
      const result = await bulkPublishApi(classLevel, term.id)
      setBulkResult({ classLevel, ...result })
      if (result.published > 0) {
        setClasses(prev => prev.map(c => c.classLevel === classLevel
          ? { ...c, published: c.published + result.published }
          : c
        ))
      }
    } catch {
      showToast(tr('Failed to bulk publish. Try again.'), 'error')
    } finally {
      setBulkPublishing(null)
    }
  }

  const reloadClasses = async () => {
    if (!term) return
    const { classLevels } = await getClassLevelsApi()
    const overviews = await Promise.all(classLevels.map((cl) => getClassOverviewApi(term.id, cl)))
    setClasses(classLevels.map((cl, i) => {
      const students = overviews[i].students
      return {
        classLevel: cl,
        total: students.length,
        filled: students.filter((s: any) => s.reportCard?.marksFilled === true).length,
        published: students.filter((s: any) => s.reportCard?.status === 'PUBLISHED').length,
        hasSubjects: (overviews[i].subjectCount ?? 0) > 0,
      }
    }))
  }

  useEffect(() => {
    const load = async () => {
      try {
        const { term: t } = await getCurrentTermApi()
        setTerm(t)
        const { classLevels } = await getClassLevelsApi()
        const overviews = await Promise.all(classLevels.map((cl) => getClassOverviewApi(t.id, cl)))
        setClasses(classLevels.map((cl, i) => {
          const students = overviews[i].students
          return {
            classLevel: cl,
            total: students.length,
            filled: students.filter((s: any) => s.reportCard?.marksFilled === true).length,
            published: students.filter((s: any) => s.reportCard?.status === 'PUBLISHED').length,
            hasSubjects: (overviews[i].subjectCount ?? 0) > 0,
          }
        }))
      } catch (err: any) {
        if (err?.response?.status === 404) setError(tr('No active term set. Please set a current term first.'))
        else setError(tr('Failed to load classes.'))
      } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading classes...</div>
  if (error) return (
    <div className="text-center py-12">
      <p className="text-amber-600 text-sm">{error}</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tr('Classes')}</h2>
          {term && <p className="text-muted-foreground text-sm mt-1">{term.name} — {term.session}</p>}
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-sm">{tr('No classes found. Add students first.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => {
            const pct = c.total > 0 ? Math.round((c.filled / c.total) * 100) : 0
            const pending = c.total - c.filled
            return (
              <div key={c.classLevel} className="bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                    {c.classLevel.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{c.classLevel}</p>
                    <p className="text-xs text-muted-foreground">{c.total} {tr('students')}{isClassMaster ? ` · ${c.published} ${tr('published')}` : ''}</p>
                  </div>
                </div>
                {c.hasSubjects && (
                  <>
                    <div className="w-full bg-muted rounded-full h-1.5 mb-3">
                      <div className="bg-primary/100 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs mb-4">
                      <span className="text-primary font-semibold">{c.filled} {tr('filled')}</span>
                      {pending > 0 && <span className="text-amber-600 font-semibold">{pending} {tr('pending')}</span>}
                    </div>
                  </>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => router.push(`/report-cards/class/${encodeURIComponent(c.classLevel)}?termId=${term?.id}&termName=${encodeURIComponent(term?.name ?? '')}`)}
                    className="flex-1 text-xs border border-border text-muted-foreground py-1.5 rounded-lg hover:bg-muted transition">
                    {tr('View Class')}
                  </button>
                  {isAdmin && c.filled > c.published && (
                    <button
                      onClick={() => handleBulkPublish(c.classLevel)}
                      disabled={bulkPublishing === c.classLevel}
                      className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                      title={tr('Publish all eligible report cards for this class')}>
                      <Send size={11} />
                      {bulkPublishing === c.classLevel ? tr('Publishing…') : tr('Publish All')}
                    </button>
                  )}
                  {isAdmin && c.published > 0 && (
                    <button onClick={() => handleClassPrint(c.classLevel, term?.id ?? '')} disabled={printing}
                      className="flex items-center gap-1.5 text-xs border border-border text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition disabled:opacity-50"
                      title={`${tr('Print all')} ${c.published} ${tr('published cards')}`}>
                      <Printer size={12} /> {printing ? tr('Loading...') : `${tr('Print')} (${c.published})`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {printJob && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: '210mm', overflow: 'visible', visibility: 'hidden', pointerEvents: 'none' }}>
          {printJob.cards.map((rc) => (
            <div key={rc.id} id={`rc-print-${rc.id}`}>
              <PrintableReportCard
                school={{ name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null }}
                student={{ name: rc.student.name, studentId: rc.student.studentId, classLevel: rc.student.classLevel, guardianName: rc.student.guardianName }}
                term={{ name: rc.term.name, session: rc.term.session }}
                subjects={rc.entries.map(e => ({ id: e.subject.id, name: e.subject.name }))}
                entries={rc.entries.map(e => ({ subjectId: e.subject.id, score: e.score, seq1Score: e.seq1Score ?? null, seq2Score: e.seq2Score ?? null, grade: e.grade, remarks: e.remarks ?? '' } as PrintEntry))}
                generalRemarks={rc.remarks ?? ''}
                generalRemarksFr={rc.remarksFr ?? ''}
                average={rc.average ?? 0}
                position={rc.position ?? null}
                config={printJob.config}
              />
            </div>
          ))}
        </div>
      )}

      {/* Bulk publish result modal */}
      {bulkResult && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              {bulkResult.published > 0
                ? <CheckCircle size={22} className="text-green-600" />
                : <AlertTriangle size={22} className="text-amber-500" />}
              <h3 className="text-lg font-bold text-foreground">{tr('Publish All —')} {bulkResult.classLevel}</h3>
            </div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{bulkResult.published}</p>
                <p className="text-xs text-green-700 mt-0.5">Published</p>
              </div>
              <div className="flex-1 bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{bulkResult.skipped}</p>
                <p className="text-xs text-amber-700 mt-0.5">Skipped</p>
              </div>
            </div>
            {bulkResult.issues.length > 0 && (
              <div className="bg-muted dark:bg-card rounded-xl border border-border max-h-52 overflow-y-auto mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">{tr('Issues')}</p>
                {bulkResult.issues.map((issue, i) => (
                  <div key={i} className="px-4 py-2 border-t border-gray-100 first:border-0">
                    <p className="text-sm font-medium text-foreground">{issue.student}</p>
                    <p className="text-xs text-amber-600 mt-0.5">{issue.reason}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setBulkResult(null); reloadClasses() }}
              className="w-full bg-foreground hover:bg-foreground/90 text-white py-2.5 rounded-xl text-sm font-medium transition">
              Close
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}

export default function ReportCardsPage() {
  const tr = useT()
  const router = useRouter()
  const { isAuthenticated, user, school } = useAuthStore()

  if (TEACHER_ROLES.includes(user?.role ?? '') || user?.role === 'CLASS_MASTER') return <TeacherClassesView />
  const { toast, showToast, hideToast } = useToast()
  const [reportCards, setReportCards] = useState<ReportCard[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterTermId, setFilterTermId] = useState('')
  const [form, setForm] = useState({ studentId: '', termId: '' })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [printJob, setPrintJob] = useState<PrintJob | null>(null)
  const [printing, setPrinting] = useState(false)
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<{ classLevel: string; published: number; skipped: number; issues: { student: string; reason: string }[] } | null>(null)
  const [openDropdown, setOpenDropdown] = useState<'classList' | 'printClass' | 'bulkPublish' | null>(null)
  const [classReadiness, setClassReadiness] = useState<Record<string, ClassReadiness>>({})
  const [exporting, setExporting] = useState(false)
  const isAdmin = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')


  const handleBulkPublish = async (classLevel: string) => {
    if (!activeTerm) return
    setBulkPublishing(classLevel)
    try {
      const result = await bulkPublishApi(classLevel, activeTerm.id)
      setBulkResult({ classLevel, ...result })
      fetchReportCards(filterTermId || undefined)
    } catch {
      showToast(tr('Failed to bulk publish'), 'error')
    } finally { setBulkPublishing(null) }
  }

  useEffect(() => {
    if (!printJob) return
    const timer = setTimeout(() => {
      openPopupPrint(printJob.cards, printJob.config, school?.name ?? '', school?.type ?? 'SECONDARY', school?.logo ?? null)
      setPrintJob(null)
      setPrinting(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [printJob])

  const handlePrintClassList = async (classLevel: string, termId: string) => {
    setPrinting(true)
    try {
      const [overview, tpl] = await Promise.all([
        getClassOverviewApi(termId, classLevel),
        getClassListTemplateApi().catch(() => ({ config: {} })),
      ])
      const students = overview.students.map((s: any) => ({ name: s.name, studentId: s.studentId }))
      const logoUrl = school?.logo ? window.location.origin + school.logo : null
      printClassList({
        students,
        classLevel,
        schoolName: school?.name ?? '',
        schoolType: school?.type ?? '',
        logoUrl,
        config: mergeClassListConfig(tpl.config, school?.type),
      })
    } catch {
      showToast(tr('Failed to load class list'), 'error')
    } finally {
      setPrinting(false)
    }
  }

  const handleClassPrint = async (classLevel: string, termId: string) => {
    setPrinting(true)
    try {
      const [rcData, tplData] = await Promise.all([
        getReportCardsApi({ termId, classLevel }),
        getTemplateApi().catch(() => ({ config: {} })),
      ])
      const published: RawRC[] = (rcData.reportCards as RawRC[]).filter((rc: RawRC) => rc.status === 'PUBLISHED')
      if (!published.length) { showToast(tr('No published cards for this class'), 'error'); setPrinting(false); return }
      const saved = tplData.config as Partial<TemplateConfig> | undefined
      const base = TEMPLATE_DEFAULTS[((saved?.template as TemplateName) ?? 'classic')]
      const config = saved && Object.keys(saved).length > 0 ? { ...base, ...saved } as TemplateConfig : getDefaultLayoutForType(school?.type)
      setPrintJob({ cards: published, config })
    } catch {
      showToast(tr('Failed to load cards for printing'), 'error')
      setPrinting(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else fetchAll()
  }, [isAuthenticated])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [stuData, termData] = await Promise.all([getStudentsApi(), getTermsApi()])
      setStudents(stuData.students)
      setTerms(termData.terms)
      const current = termData.terms.find((t: Term) => t.isCurrent)
      const currentId = current?.id || ''
      setFilterTermId(currentId)
      const rcData = await getReportCardsApi(currentId ? { termId: currentId } : {})
      setReportCards(rcData.reportCards)
      // Fetch publish readiness for all classes in the current term
      if (currentId) {
        getClassReadinessApi(currentId).then(d => setClassReadiness(d.readiness)).catch(() => {})
      }
    } catch {
      showToast(tr('Failed to load data'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchReportCards = async (termId?: string) => {
    const data = await getReportCardsApi(termId ? { termId } : {})
    setReportCards(data.reportCards)
    // Refresh readiness when data changes
    if (termId) {
      getClassReadinessApi(termId).then(d => setClassReadiness(d.readiness)).catch(() => {})
    }
  }

  const handleFilterChange = (termId: string) => {
    setFilterTermId(termId)
    fetchReportCards(termId || undefined)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const data = await createReportCardApi(form)
      setShowModal(false)
      setForm({ studentId: '', termId: '' })
      fetchReportCards(filterTermId || undefined)
      if (data.alreadyExists) {
        showToast(tr('Report card already exists — opening it'))
        router.push(`/report-cards/${data.reportCard.id}`)
      } else {
        showToast(tr('Report card created successfully'))
        router.push(`/report-cards/${data.reportCard.id}`)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || tr('Failed to create report card'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteReportCardApi(deleteTarget)
      setDeleteTarget(null)
      fetchReportCards(filterTermId || undefined)
      showToast(tr('Report card deleted'))
    } catch {
      showToast(tr('Failed to delete report card'), 'error')
    }
  }

  const currentTerm = terms.find(t => t.isCurrent)
  const activeTerm = terms.find(t => t.id === filterTermId) ?? currentTerm

  // Active term chip, or every term when "All Terms" is selected.
  const exportTargetTerms = () => (filterTermId ? terms.filter((t) => t.id === filterTermId) : terms)

  type ExportStudent = { id: string; name: string; studentId: string; classLevel: string; guardianName?: string | null; guardianPhone?: string | null; guardianEmail?: string | null }

  // Roster export (no marks). The students who have a report card in the target
  // term — i.e. exactly what the table shows when filtered to that term. One file per term.
  const handleExportSchool = async () => {
    const targets = exportTargetTerms()
    if (targets.length === 0) { showToast(tr('No current term set'), 'error'); return }
    setExporting(true)
    try {
      const subData = await getSubjectsApi()
      const subjectsByClass: Record<string, string[]> = {}
      for (const s of (subData.subjects as { name: string; classLevel: string }[])) {
        (subjectsByClass[s.classLevel] ??= []).push(s.name)
      }
      const cols = [
        { label: tr('Name'), value: (s: ExportStudent) => s.name },
        { label: tr('Student ID'), value: (s: ExportStudent) => s.studentId },
        { label: tr('Class'), value: (s: ExportStudent) => s.classLevel },
        { label: tr('Subjects'), value: (s: ExportStudent) => (subjectsByClass[s.classLevel] || []).join(', ') },
        { label: tr('Guardian'), value: (s: ExportStudent) => s.guardianName || '' },
        { label: tr('Guardian Phone'), value: (s: ExportStudent) => s.guardianPhone || '' },
        { label: tr('Guardian Email'), value: (s: ExportStudent) => s.guardianEmail || '' },
      ]
      const files: { name: string; content: string }[] = []
      for (const term of targets) {
        const res = await getReportCardsApi({ termId: term.id })
        const seen = new Set<string>()
        const students: ExportStudent[] = []
        for (const rc of (res.reportCards as { student: ExportStudent }[])) {
          if (rc.student && !seen.has(rc.student.id)) { seen.add(rc.student.id); students.push(rc.student) }
        }
        if (students.length === 0) continue
        files.push({ name: datedFilename(`school-students-${term.name}`), content: buildCsv(students, cols) })
      }
      if (files.length === 0) { showToast(tr('Nothing to export'), 'error'); return }
      if (files.length === 1) saveCsv(files[0].name, files[0].content)
      else downloadZip(datedFilename('school-students-all-terms', 'zip'), files)
      showToast(tr('Export started'))
    } catch {
      showToast(tr('Failed to export'), 'error')
    } finally {
      setExporting(false)
    }
  }

  // Whole-school master sheet WITH marks, one file per target term.
  const handleExportSchoolMarks = async () => {
    const targets = exportTargetTerms()
    if (targets.length === 0) { showToast(tr('No current term set'), 'error'); return }
    setExporting(true)
    try {
      const files: { name: string; content: string }[] = []
      for (const term of targets) {
        const data = await getMarksExportApi(term.id)
        if (data.students.length === 0) continue
        const csv = buildCsv(data.students, [
          { label: tr('Class'), value: (s) => s.classLevel },
          { label: tr('Name'), value: (s) => s.name },
          { label: tr('Student ID'), value: (s) => s.studentIdCode },
          ...data.subjects.map((subj) => ({ label: subj, value: (s: MarksExportStudent) => s.scores[subj] ?? '' })),
          { label: tr('Average'), value: (s) => (s.average != null ? s.average.toFixed(1) : '') },
          { label: tr('Rank'), value: (s) => s.position ?? '' },
        ])
        files.push({ name: datedFilename(`school-marks-${data.term.name}`), content: csv })
      }
      if (files.length === 0) { showToast(tr('Nothing to export'), 'error'); return }
      if (files.length === 1) saveCsv(files[0].name, files[0].content)
      else downloadZip(datedFilename('school-marks-all-terms', 'zip'), files)
      showToast(tr('Export started'))
    } catch {
      showToast(tr('Failed to export'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const publishedClasses = [...new Set(
    reportCards.filter(rc => rc.status === 'PUBLISHED').map(rc => rc.student.classLevel)
  )]
  const allClasses = [...new Set(reportCards.map(rc => rc.student.classLevel))].sort()
  const unpublishedClasses = allClasses.filter(cl =>
    reportCards.some(rc => rc.student.classLevel === cl && rc.status !== 'PUBLISHED')
  )

  return (
    <DesktopOnly>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tr('Report Cards')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {currentTerm ? `${tr('Current term:')} ${currentTerm.name} — ${currentTerm.session}` : tr('No current term set')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">

          {/* Transparent overlay — clicking outside any open dropdown closes it */}
          {openDropdown && (
            <div className="fixed inset-0 z-20" onClick={() => setOpenDropdown(null)} />
          )}

          {/* Publish Class dropdown */}
          {isAdmin && unpublishedClasses.length > 0 && activeTerm && (
            <div className="relative z-30">
              <button
                disabled={!!bulkPublishing}
                onClick={() => setOpenDropdown(v => v === 'bulkPublish' ? null : 'bulkPublish')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  openDropdown === 'bulkPublish'
                    ? 'bg-green-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}>
                <Send size={14} />
                {bulkPublishing ? tr('Publishing…') : tr('Publish Class')}
                <ChevronDown size={13} className={`transition-transform duration-200 ${openDropdown === 'bulkPublish' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'bulkPublish' && (
                <div className="absolute right-0 top-[calc(100%+4px)] bg-card border border-border rounded-xl shadow-xl z-30 py-1.5 min-w-[220px] overflow-hidden">
                  <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{tr('Select class')}</p>
                  {unpublishedClasses.map(cl => {
                    const r = classReadiness[cl]
                    const ready = !r || r.ready
                    const missingSeqs = r?.missingSeqs ?? 0
                    const missingRemarks = r?.missingRemarks ?? 0
                    const noSubjects = r?.noSubjects ?? false
                    const nothingToPublish = !!r && !r.noSubjects && (r.total ?? 0) === 0
                    return (
                      <div key={cl} className="px-1">
                        <button
                          disabled={!ready || bulkPublishing === cl}
                          onClick={() => { handleBulkPublish(cl); setOpenDropdown(null) }}
                          className="w-full text-left px-3 py-2 text-sm rounded-lg transition flex items-start gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted enabled:hover:bg-muted"
                        >
                          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-green-500' : 'bg-destructive'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{cl}</p>
                            {!ready && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {noSubjects && (
                                  <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                                    {tr('No subjects assigned')}
                                  </span>
                                )}
                                {missingSeqs > 0 && (
                                  <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                                    {missingSeqs} {tr('missing seqs')}
                                  </span>
                                )}
                                {missingRemarks > 0 && (
                                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                    {missingRemarks} {tr('no remarks')}
                                  </span>
                                )}
                                {nothingToPublish && (
                                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                    {tr('Nothing to publish')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Class List dropdown */}
          {activeTerm && (
            <div className="relative z-30">
              <button
                disabled={printing}
                onClick={() => setOpenDropdown(v => v === 'classList' ? null : 'classList')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 border ${
                  openDropdown === 'classList'
                    ? 'bg-muted border-border text-foreground'
                    : 'border-border text-foreground hover:bg-muted'
                }`}>
                <List size={14} />
                {printing ? tr('Loading…') : tr('Class List')}
                <ChevronDown size={13} className={`transition-transform duration-200 ${openDropdown === 'classList' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'classList' && (
                <div className="absolute right-0 top-[calc(100%+4px)] bg-card border border-border rounded-xl shadow-xl z-30 py-1.5 min-w-[160px] overflow-hidden">
                  <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{tr('Select class')}</p>
                  {[...new Set([...unpublishedClasses, ...publishedClasses])].sort().map(cl => (
                    <button key={cl} onClick={() => { handlePrintClassList(cl, activeTerm.id); setOpenDropdown(null) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition text-foreground flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      {cl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Print Class dropdown */}
          {publishedClasses.length > 0 && activeTerm && (
            <div className="relative z-30">
              <button
                disabled={printing}
                onClick={() => setOpenDropdown(v => v === 'printClass' ? null : 'printClass')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 border ${
                  openDropdown === 'printClass'
                    ? 'bg-muted border-border text-foreground'
                    : 'border-border text-foreground hover:bg-muted'
                }`}>
                <Printer size={14} />
                {printing ? tr('Loading…') : tr('Print Class')}
                <ChevronDown size={13} className={`transition-transform duration-200 ${openDropdown === 'printClass' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'printClass' && (
                <div className="absolute right-0 top-[calc(100%+4px)] bg-card border border-border rounded-xl shadow-xl z-30 py-1.5 min-w-[160px] overflow-hidden">
                  <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{tr('Select class')}</p>
                  {publishedClasses.map(cl => (
                    <button key={cl} onClick={() => { handleClassPrint(cl, activeTerm.id); setOpenDropdown(null) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition text-foreground flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                      {cl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => { setShowModal(true); setForm({ studentId: '', termId: currentTerm?.id || '' }) }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition"
          >
            <Plus size={16} /> {tr('Create Report Card')}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => handleFilterChange('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${!filterTermId ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}
        >{tr('All Terms')}</button>
        {terms.map(term => (
          <button key={term.id} onClick={() => handleFilterChange(term.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filterTermId === term.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}
          >
            {term.name} {term.session} {term.isCurrent ? tr('(Current)') : ''}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {tr('Export')} · {filterTermId && activeTerm ? `${activeTerm.name} ${activeTerm.session}` : `${tr('All Terms')} — ${tr('one file each')}`}:
          </span>
          <button onClick={handleExportSchool} disabled={exporting || terms.length === 0}
            className="flex items-center gap-1.5 border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50 transition">
            <Download size={14} /> {tr('Export school data')}
          </button>
          <button onClick={handleExportSchoolMarks} disabled={exporting || terms.length === 0}
            className="flex items-center gap-1.5 border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50 transition">
            <Download size={14} /> {tr('Export school data (with marks)')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
      ) : reportCards.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <FileText size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{tr('No report cards yet.')}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Student')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Class')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Term')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Subjects')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Average')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reportCards.map((rc) => (
                <tr key={rc.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {rc.student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{rc.student.name}</p>
                        <p className="text-xs text-muted-foreground">{rc.student.studentId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{rc.student.classLevel}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{rc.term.name} — {rc.term.session}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{rc.entries.length} {tr('subjects')}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{rc.average != null ? rc.average.toFixed(1) : '—'}</td>
                  <td className="px-4 py-3">
                    {rc.status === 'PUBLISHED' ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full w-fit">
                        <CheckCircle size={10} /> {tr('Published')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full w-fit">
                        <Clock size={10} /> {tr('Draft')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => router.push(`/report-cards/${rc.id}`)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition" title={tr('View / Print')}>
                        <Eye size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget(rc.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition" title={tr('Delete')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full border border-transparent dark:border-zinc-800 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{tr('Create Report Card')}</h3>
              <button onClick={() => { setShowModal(false); setError('') }} className="text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Student')}</label>
                <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">{tr('Select student...')}</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.classLevel}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Term')}</label>
                <select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">{tr('Select term...')}</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name} — {t.session}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">
                  {tr('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? tr('Creating...') : tr('Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={tr('Delete Report Card')}
        message={tr('Are you sure you want to delete this report card? This action cannot be undone.')}
        confirmLabel={tr('Delete')}
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {bulkResult && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              {bulkResult.published > 0 ? <CheckCircle size={22} className="text-green-600" /> : <AlertTriangle size={22} className="text-amber-500" />}
              <h3 className="text-lg font-bold text-foreground">{tr('Publish All —')} {bulkResult.classLevel}</h3>
            </div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{bulkResult.published}</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{tr('Published')}</p>
              </div>
              <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{bulkResult.skipped}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{tr('Skipped')}</p>
              </div>
            </div>
            {bulkResult.issues.length > 0 && (
              <div className="bg-muted dark:bg-card rounded-xl border border-border max-h-52 overflow-y-auto mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">{tr('Issues')}</p>
                {bulkResult.issues.map((issue, i) => (
                  <div key={i} className="px-4 py-2 border-t border-gray-100 dark:border-border">
                    <p className="text-sm font-medium text-foreground dark:text-foreground">{issue.student}</p>
                    <p className="text-xs text-amber-600 mt-0.5">{issue.reason}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setBulkResult(null)} className="w-full bg-muted hover:bg-muted/80 text-white py-2.5 rounded-xl text-sm font-medium transition">{tr('Close')}</button>
          </div>
        </div>
      )}

      {printJob && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: '210mm', overflow: 'visible', visibility: 'hidden', pointerEvents: 'none' }}>
          {printJob.cards.map((rc) => (
            <div key={rc.id} id={`rc-print-${rc.id}`}>
              <PrintableReportCard
                school={{ name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null }}
                student={{ name: rc.student.name, studentId: rc.student.studentId, classLevel: rc.student.classLevel, guardianName: rc.student.guardianName }}
                term={{ name: rc.term.name, session: rc.term.session }}
                subjects={rc.entries.map(e => ({ id: e.subject.id, name: e.subject.name }))}
                entries={rc.entries.map(e => ({ subjectId: e.subject.id, score: e.score, seq1Score: e.seq1Score ?? null, seq2Score: e.seq2Score ?? null, grade: e.grade, remarks: e.remarks ?? '' } as PrintEntry))}
                generalRemarks={rc.remarks ?? ''}
                generalRemarksFr={rc.remarksFr ?? ''}
                average={rc.average ?? 0}
                position={rc.position ?? null}
                config={printJob.config}
              />
            </div>
          ))}
        </div>
      )}
    </div>
    </DesktopOnly>
  )
}
