'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getReportCardsApi, createReportCardApi, deleteReportCardApi, getCurrentTermApi, getClassLevelsApi, getClassOverviewApi, bulkPublishApi, getClassReadinessApi, ClassReadiness, getMarksExportApi, MarksExportStudent } from '@/lib/api/reportcards'
import { getClassLevelsApi as getClassLevelsFullApi } from '@/lib/api/classLevels'
import { getDepartmentsApi, Department } from '@/lib/api/departments'
import { getStudentsApi } from '@/lib/api/students'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTermsApi } from '@/lib/api/terms'
import { buildCsv, saveCsv, datedFilename } from '@/lib/csv'
import { downloadZip } from '@/lib/zip'
import { FileText, Plus, Trash2, Eye, X, CheckCircle, Clock, Printer, Send, AlertTriangle, List, Download, Scroll, FileSpreadsheet, Search } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import PrintableReportCard, { PrintEntry } from '@/components/ui/PrintableReportCard'
import DesktopOnly from '@/components/ui/DesktopOnly'
import { getTemplateApi, TemplateConfig, mergeSavedStandardConfig, DocVariant } from '@/lib/api/reportCardTemplate'
import { ClassListDocOptions, classListPrintPortalHtml } from '@/lib/classListDocument'
import ClassPickerModal, { ClassOption } from '@/components/ui/ClassPickerModal'
import { getClassListTemplateApi, mergeClassListConfig } from '@/lib/api/classListTemplate'
import Pagination from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { getGradingScaleApi, GradeRange } from '@/lib/api/gradingScale'
import { useT } from '@/lib/i18n'
import { ExcelTemplate, listExcelTemplatesApi, downloadExcelTranscriptApi, fetchExcelPreviewHtmlApi } from '@/lib/api/excelTemplates'

interface RawEntry {
  id: string; score: number; seq1Score?: number | null; seq2Score?: number | null; resitScore?: number | null
  grade: string; remarks: string; subject: { id: string; name: string; coefficient?: number; credit?: number }
}
interface RawRC {
  id: string; status: string; remarks?: string; remarksFr?: string | null; average?: number | null; position?: number | null
  classSize?: number | null; classAverage?: number | null
  annualAverage?: number | null; annualPosition?: number | null; annualClassSize?: number | null
  decision?: string | null
  student: { id: string; name: string; studentId: string; classLevel: string; guardianName?: string; gender?: string; isActive?: boolean }
  term: { id: string; name: string; session: string }
  entries: RawEntry[]
}

interface PrintJob {
  cards: RawRC[]
  config: TemplateConfig
  /** Bulk printing a whole class is the end-of-term hand-out, so it produces STUDENT
   *  copies. An official copy is a deliberate, per-student act (it gets sealed and sent),
   *  and is printed from that student's own report card or transcript page. */
  variant: DocVariant
}

/**
 * Print the .rc-print-portal in place (no popup window) — waits for any
 * images inside it to finish loading first, same as the single report card's
 * print flow, then calls afterPrint() to clear the caller's print-job state.
 */
function printPortalWhenReady(afterPrint: () => void) {
  const el = document.querySelector('.rc-print-portal')
  const imgs = el ? Array.from(el.getElementsByTagName('img')) : []
  const doPrint = () => { window.print(); afterPrint() }
  if (imgs.length === 0) { setTimeout(doPrint, 200); return }
  let done = 0
  imgs.forEach(img => {
    const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 200) }
    if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
  })
}

interface ReportCard {
  id: string
  status: string
  totalScore: number | null
  average: number | null
  decision?: string | null
  // Every period of this card's session has a published report card, so the
  // annual transcript can be printed (see getReportCards).
  transcriptReady?: boolean
  // This card belongs to the session's CLOSING period — the only rows that carry
  // the annual transcript action (a year-end document). That's the second
  // semester at a university and the third term at a primary/secondary school.
  isFinalTerm?: boolean
  student: { id: string; name: string; classLevel: string; studentId: string }
  term: { id: string; name: string; session: string }
  entries: { id: string; score: number; grade: string; subject: { name: string } }[]
}
interface Student { id: string; name: string; classLevel: string; studentId: string }
interface Term { id: string; name: string; session: string; isCurrent: boolean }

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']
const FILTER_TERM_STORAGE_KEY = 'report-cards-filter-term'

// Secondary non-default departments store classes with a " (Department)" suffix.
const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

// ── Teacher/Admin class-based view ────────────────────────────────────────────────
function TeacherClassesView() {
  const tr = useT()
  const router = useRouter()
  const { school, user } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const isAdmin = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isSecondary = school?.type === 'SECONDARY'
  const [term, setTerm] = useState<{ id: string; name: string; session: string } | null>(null)
  const [classes, setClasses] = useState<{ classLevel: string; total: number; filled: number; published: number; hasSubjects: boolean }[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState('')
  const [classDeptMap, setClassDeptMap] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printJob, setPrintJob] = useState<PrintJob | null>(null)
  const [printing, setPrinting] = useState(false)
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<{ classLevel: string; published: number; skipped: number; issues: { student: string; reason: string }[] } | null>(null)
  const [gradeBands, setGradeBands] = useState<GradeRange[]>([])

  useEffect(() => { getGradingScaleApi().then(d => setGradeBands(d.ranges)).catch(() => {}) }, [])

  useEffect(() => {
    if (!printJob) return
    const timer = setTimeout(() => {
      printPortalWhenReady(() => { setPrintJob(null); setPrinting(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [printJob])

  const handleClassPrint = async (classLevel: string, termId: string) => {
    setPrinting(true)
    try {
      const [rcData, tplData] = await Promise.all([
        getReportCardsApi({ termId, classLevel }),
        getTemplateApi().catch(() => ({ config: {} })),
      ])
      // Disabled/Dismissed students are excluded from bulk printing (see
      // Student.status in schema.prisma) — they're still printable one at a
      // time from their own report-card detail page if ever needed.
      const published: RawRC[] = (rcData.reportCards as RawRC[]).filter(rc => rc.status === 'PUBLISHED' && rc.student.isActive !== false)
      if (!published.length) { setPrinting(false); return }
      const config = mergeSavedStandardConfig(tplData.config as Partial<TemplateConfig>, school?.type)
      setPrintJob({ cards: published, config, variant: 'student' })
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

  // A teacher/class master should only see classes they actually teach in (≥1 of
  // their courses) or are class master of — not every class in the school.
  const buildClasses = (classLevels: string[], overviews: Awaited<ReturnType<typeof getClassOverviewApi>>[]) =>
    classLevels
      .map((cl, i) => ({ cl, ov: overviews[i] }))
      .filter(({ cl, ov }) => isAdmin || (ov.teacherSubjectCount ?? 0) > 0 || cl === user?.masterClassLevel)
      .map(({ cl, ov }) => ({
        classLevel: cl,
        total: ov.students.length,
        filled: ov.students.filter((s: any) => s.reportCard?.marksFilled === true).length,
        published: ov.students.filter((s: any) => s.reportCard?.status === 'PUBLISHED').length,
        hasSubjects: (ov.subjectCount ?? 0) > 0,
      }))

  const reloadClasses = async () => {
    if (!term) return
    const { classLevels } = await getClassLevelsApi()
    const overviews = await Promise.all(classLevels.map((cl) => getClassOverviewApi(term.id, cl)))
    setClasses(buildClasses(classLevels, overviews))
  }

  useEffect(() => {
    const load = async () => {
      try {
        const { term: t } = await getCurrentTermApi()
        setTerm(t)
        const { classLevels } = await getClassLevelsApi()
        const overviews = await Promise.all(classLevels.map((cl) => getClassOverviewApi(t.id, cl)))
        setClasses(buildClasses(classLevels, overviews))
        // Secondary: build a class-name → departmentId map and load departments
        // so the class grid can be grouped/filtered by department.
        if (isSecondary) {
          const [full, deptRes] = await Promise.all([getClassLevelsFullApi(), getDepartmentsApi()])
          setClassDeptMap(Object.fromEntries(full.classLevels.map((c) => [c.name, c.departmentId ?? null])))
          setDepartments(deptRes.departments)
          setActiveDeptId((deptRes.departments.find((d) => d.isDefault) ?? deptRes.departments[0])?.id ?? '')
        }
      } catch (err: any) {
        if (err?.response?.status === 404) setError(tr('No active term set. Please set a current term first.'))
        else setError(tr('Failed to load classes.'))
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const displayedClasses = isSecondary && activeDeptId
    ? classes.filter((c) => classDeptMap[c.classLevel] === activeDeptId)
    : classes

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

      {/* Secondary: department tabs to group the class grid */}
      {isSecondary && departments.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {departments.map((d) => {
            const count = classes.filter((c) => classDeptMap[c.classLevel] === d.id).length
            return (
              <button key={d.id} onClick={() => setActiveDeptId(d.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 active:scale-95 ${
                  activeDeptId === d.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {d.name}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeDeptId === d.id ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {displayedClasses.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-sm">{tr('No classes found. Add students first.')}</p>
        </div>
      ) : (
        <div key={activeDeptId} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
          {displayedClasses.map((c) => {
            const pct = c.total > 0 ? Math.round((c.filled / c.total) * 100) : 0
            const pending = c.total - c.filled
            return (
              <div key={c.classLevel} className="bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                    {(isSecondary ? stripDeptSuffix(c.classLevel) : c.classLevel).charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{isSecondary ? stripDeptSuffix(c.classLevel) : c.classLevel}</p>
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

      {printJob && typeof document !== 'undefined' && createPortal(
        <div className="rc-print-portal">
          {printJob.cards.map((rc, i) => (
            <div key={rc.id} style={i < printJob.cards.length - 1 ? { pageBreakAfter: 'always' } : undefined}>
              <PrintableReportCard
                school={{ name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null, stamp: school?.stamp ?? null, language: school?.language, email: school?.email, phone: school?.phone, address: school?.address, website: school?.website, authorizationNumber: school?.authorizationNumber, officialLeftTextEn: school?.officialLeftTextEn, officialLeftTextFr: school?.officialLeftTextFr, officialRightTextEn: school?.officialRightTextEn, officialRightTextFr: school?.officialRightTextFr }}
                student={{ name: rc.student.name, studentId: rc.student.studentId, classLevel: rc.student.classLevel, guardianName: rc.student.guardianName, gender: rc.student.gender }}
                term={{ name: rc.term.name, session: rc.term.session }}
                subjects={rc.entries.map(e => ({ id: e.subject.id, name: e.subject.name, coefficient: e.subject.coefficient, credit: e.subject.credit }))}
                entries={rc.entries.map(e => ({ subjectId: e.subject.id, score: e.score, seq1Score: e.seq1Score ?? null, seq2Score: e.seq2Score ?? null, resitScore: e.resitScore ?? null, grade: e.grade, remarks: e.remarks ?? '' } as PrintEntry))}
                generalRemarks={rc.remarks ?? ''}
                generalRemarksFr={rc.remarksFr ?? ''}
                average={rc.average ?? 0}
                position={rc.position ?? null}
                classSize={rc.classSize ?? undefined}
                classAverage={rc.classAverage ?? undefined}
                annualAverage={rc.annualAverage ?? undefined}
                annualPosition={rc.annualPosition ?? undefined}
                annualClassSize={rc.annualClassSize ?? undefined}
                config={printJob.config}
                variant={printJob.variant}
                gradeBands={gradeBands}
              />
            </div>
          ))}
        </div>,
        document.body,
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
  const { isAuthenticated, user, school, activeSession } = useAuthStore()

  if (TEACHER_ROLES.includes(user?.role ?? '') || user?.role === 'CLASS_MASTER') return <TeacherClassesView />
  const { toast, showToast, hideToast } = useToast()
  const [reportCards, setReportCards] = useState<ReportCard[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Persisted across "open a report card, then hit Back" the same way the page
  // number is (see usePagination's persistKey) — sessionStorage.getItem returning
  // null (vs '') is what distinguishes "never chosen yet" from "explicitly chose
  // All Terms", so fetchAll below knows whether to respect it or apply its own default.
  const [filterTermId, setFilterTermIdState] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(FILTER_TERM_STORAGE_KEY) ?? '' : ''
  )
  const setFilterTermId = (termId: string) => {
    setFilterTermIdState(termId)
    if (typeof window !== 'undefined') sessionStorage.setItem(FILTER_TERM_STORAGE_KEY, termId)
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ studentId: '', termId: '' })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [printJob, setPrintJob] = useState<PrintJob | null>(null)
  const [printing, setPrinting] = useState(false)
  // Class-list print data — rendered into an off-screen in-page portal and
  // printed via window.print(), same as the report card (no popup window).
  const [classListPrintData, setClassListPrintData] = useState<ClassListDocOptions[] | null>(null)
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<{ classLevel: string; published: number; skipped: number; issues: { student: string; reason: string }[] } | null>(null)
  const [classPicker, setClassPicker] = useState<'publish' | 'classList' | 'printClass' | null>(null)
  const [pickerBusy, setPickerBusy] = useState(false)
  const [classReadiness, setClassReadiness] = useState<Record<string, ClassReadiness>>({})
  const [exporting, setExporting] = useState(false)
  const [gradeBands, setGradeBands] = useState<GradeRange[]>([])
  const [excelTemplates, setExcelTemplates] = useState<ExcelTemplate[]>([])
  const [downloadingExcel, setDownloadingExcel] = useState<string | null>(null)
  const [excelPreview, setExcelPreview] = useState<{ html: string; studentId: string; studentName: string; classLevel: string; session: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const isAdmin = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')

  useEffect(() => { getGradingScaleApi().then(d => setGradeBands(d.ranges)).catch(() => {}) }, [])
  useEffect(() => {
    if (school?.type !== 'UNIVERSITY') return
    listExcelTemplatesApi().then(d => setExcelTemplates(d.templates)).catch(() => {})
  }, [school?.type])

  const handleDownloadExcel = async (studentId: string, classLevel: string, session: string, studentName: string) => {
    const tpl = excelTemplates.find(t => t.classLevels.includes(classLevel)) ?? excelTemplates[0]
    if (!tpl) { showToast(tr('No Excel template configured. Add one in Settings.'), 'error'); return }
    setDownloadingExcel(studentId)
    try {
      const filename = `${studentName.replace(/\s+/g, '_')}_transcript_${session.replace('/', '-')}.xlsx`
      await downloadExcelTranscriptApi(tpl.id, studentId, session, filename)
    } catch { showToast(tr('Download failed'), 'error') }
    finally { setDownloadingExcel(null) }
  }

  const handlePreviewExcel = async (studentId: string, classLevel: string, session: string, studentName: string) => {
    const tpl = excelTemplates.find(t => t.classLevels.includes(classLevel)) ?? excelTemplates[0]
    if (!tpl) { showToast(tr('No Excel template configured.'), 'error'); return }
    setLoadingPreview(studentId)
    try {
      const html = await fetchExcelPreviewHtmlApi(tpl.id, studentId, session)
      setExcelPreview({ html, studentId, studentName, classLevel, session })
    } catch { showToast(tr('Preview failed'), 'error') }
    finally { setLoadingPreview(null) }
  }

  // Publish several classes at once.
  const handleBulkPublishMany = async (classes: string[]) => {
    if (!activeTerm || classes.length === 0) return
    setPickerBusy(true)
    let published = 0, skipped = 0
    const issues: { student: string; reason: string }[] = []
    try {
      for (const cl of classes) {
        const r = await bulkPublishApi(cl, activeTerm.id)
        published += r.published; skipped += r.skipped
        for (const i of r.issues ?? []) issues.push(i)
      }
      setBulkResult({ classLevel: classes.length === 1 ? classes[0] : `${classes.length} ${tr('classes')}`, published, skipped, issues })
      fetchReportCards(filterTermId || undefined)
    } catch {
      showToast(tr('Failed to bulk publish'), 'error')
    } finally { setPickerBusy(false); setClassPicker(null) }
  }

  // Print the class list for several classes as one document.
  const handlePrintClassListMany = async (classes: string[]) => {
    if (!activeTerm || classes.length === 0) return
    setPickerBusy(true)
    try {
      const tpl = await getClassListTemplateApi().catch(() => ({ config: {} }))
      const config = mergeClassListConfig(tpl.config, school?.type)
      const logoUrl = school?.logo ? window.location.origin + school.logo : null
      const docs = await Promise.all(classes.map(async (cl) => {
        const overview = await getClassOverviewApi(activeTerm.id, cl)
        return {
          students: overview.students.map((s: any) => ({ name: s.name, studentId: s.studentId })),
          classLevel: cl, schoolName: school?.name ?? '', schoolType: school?.type ?? '', logoUrl, config,
        }
      }))
      setClassListPrintData(docs)
    } catch {
      showToast(tr('Failed to load class list'), 'error')
    } finally { setPickerBusy(false); setClassPicker(null) }
  }

  // Print the published report cards of several classes in one job.
  const handleClassPrintMany = async (classes: string[]) => {
    if (!activeTerm || classes.length === 0) return
    setPickerBusy(true)
    try {
      const tplData = await getTemplateApi().catch(() => ({ config: {} }))
      const config = mergeSavedStandardConfig(tplData.config as Partial<TemplateConfig>, school?.type)
      const lists = await Promise.all(classes.map((cl) => getReportCardsApi({ termId: activeTerm.id, classLevel: cl })))
      // Disabled/Dismissed students are excluded from bulk printing — see Student.status in schema.prisma.
      const cards: RawRC[] = lists.flatMap((d) => (d.reportCards as RawRC[]).filter((rc) => rc.status === 'PUBLISHED' && rc.student.isActive !== false))
      if (!cards.length) { showToast(tr('No published cards for this class'), 'error'); return }
      setPrintJob({ cards, config, variant: 'student' })
    } catch {
      showToast(tr('Failed to print'), 'error')
    } finally { setPickerBusy(false); setClassPicker(null) }
  }

  useEffect(() => {
    if (!printJob) return
    const timer = setTimeout(() => {
      printPortalWhenReady(() => { setPrintJob(null); setPrinting(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [printJob])

  useEffect(() => {
    if (!classListPrintData) return
    const timer = setTimeout(() => { window.print(); setClassListPrintData(null) }, 350)
    return () => clearTimeout(timer)
  }, [classListPrintData])

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    fetchAll()
  }, [isAuthenticated, activeSession])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [stuData, termData] = await Promise.all([
        getStudentsApi(activeSession ? { session: activeSession } : undefined),
        getTermsApi(),
      ])
      setStudents(stuData.students)
      setTerms(termData.terms)
      // Default to the active year's live term, else "All Terms" of that year —
      // UNLESS the user already had a filter chosen (persisted across navigating
      // away and back), in which case that's respected instead. sessionStorage
      // returning null vs '' is what tells "never chosen" apart from "chose All
      // Terms" (an empty filterTermId).
      const yearTerms = termData.terms.filter((t: Term) => t.session === activeSession)
      const currentId = yearTerms.find((t: Term) => t.isCurrent)?.id || ''
      const hasStoredPref = typeof window !== 'undefined' && sessionStorage.getItem(FILTER_TERM_STORAGE_KEY) !== null
      const restoredStillValid = filterTermId === '' || yearTerms.some((t: Term) => t.id === filterTermId)
      const targetTermId = hasStoredPref && restoredStillValid ? filterTermId : currentId
      setFilterTermId(targetTermId)
      const rcData = await getReportCardsApi(targetTermId ? { termId: targetTermId } : { session: activeSession ?? undefined })
      setReportCards(rcData.reportCards)
      // Fetch publish readiness for all classes in the current term
      if (targetTermId) {
        getClassReadinessApi(targetTermId).then(d => setClassReadiness(d.readiness)).catch(() => {})
      }
    } catch {
      showToast(tr('Failed to load data'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchReportCards = async (termId?: string) => {
    const data = await getReportCardsApi(termId ? { termId } : { session: activeSession ?? undefined })
    setReportCards(data.reportCards)
    // Refresh readiness when data changes
    if (termId) {
      getClassReadinessApi(termId).then(d => setClassReadiness(d.readiness)).catch(() => {})
    }
  }

  const handleFilterChange = (termId: string) => {
    setFilterTermId(termId)
    setSearchQuery('')
    setPage(1)
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

  // Only the active academic year's terms are shown/exported.
  const visibleTerms = terms.filter(t => t.session === activeSession)
  const currentTerm = visibleTerms.find(t => t.isCurrent)
  const activeTerm = visibleTerms.find(t => t.id === filterTermId) ?? currentTerm

  // Active term chip, or every term of the active year when "All Terms" is selected.
  const exportTargetTerms = () => (filterTermId ? visibleTerms.filter((t) => t.id === filterTermId) : visibleTerms)

  const filteredCards = searchQuery
    ? reportCards.filter(rc => rc.student.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : reportCards

  // Paginate the table; reset to page 1 when the year or search changes. Term
  // filter is deliberately NOT in this key — fetchAll() re-asserts filterTermId
  // on every mount (even when it lands back on the same value the user had
  // before), and if that resolution happened to differ transiently it would
  // wipe the restored page. The term filter still resets the page, just
  // explicitly, in handleFilterChange — only on a real user click.
  // persistKey remembers the page across "open a report card, then hit Back".
  // ready=false while the initial fetch is in flight, so the empty placeholder
  // array doesn't clamp a restored page back down to 1 before real data loads.
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filteredCards, 15, `${activeSession}|${searchQuery}`, 'report-cards-list-page', !loading)

  type ExportStudent = { id: string; name: string; studentId: string; classLevel: string; guardianName?: string | null; guardianPhone?: string | null; guardianEmail?: string | null; isActive?: boolean }

  // Roster export (no marks). The students who have a report card in the target
  // term — i.e. exactly what the table shows when filtered to that term. One file per term.
  const handleExportSchool = async () => {
    const targets = exportTargetTerms()
    if (targets.length === 0) { showToast(tr('No current term set'), 'error'); return }
    setExporting(true)
    try {
      const subData = await getSubjectsApi()
      const allSubjects = subData.subjects as { name: string; classLevel: string; term?: string | null }[]
      const files: { name: string; content: string }[] = []
      for (const term of targets) {
        // A course scoped to one semester (university) only counts for that
        // semester; a subject with no term (primary/secondary) always counts.
        const subjectsByClass: Record<string, string[]> = {}
        for (const s of allSubjects) {
          if (s.term != null && s.term !== term.name) continue
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
        const res = await getReportCardsApi({ termId: term.id })
        const seen = new Set<string>()
        const students: ExportStudent[] = []
        // Disabled/Dismissed students are excluded from this export too — see Student.status in schema.prisma.
        for (const rc of (res.reportCards as { student: ExportStudent }[])) {
          if (rc.student && rc.student.isActive !== false && !seen.has(rc.student.id)) { seen.add(rc.student.id); students.push(rc.student) }
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

          {/* Publish Class — opens a multi-select picker (with the readiness check) */}
          {isAdmin && unpublishedClasses.length > 0 && activeTerm && (
            <button
              disabled={!!bulkPublishing || pickerBusy}
              onClick={() => setClassPicker('publish')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 bg-green-600 hover:bg-green-700 text-white">
              <Send size={14} />
              {bulkPublishing ? tr('Publishing…') : tr('Publish Class')}
            </button>
          )}

          {/* Class List — opens a multi-select picker */}
          {activeTerm && (
            <button
              disabled={printing || pickerBusy}
              onClick={() => setClassPicker('classList')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 border border-border text-foreground hover:bg-muted">
              <List size={14} />
              {printing ? tr('Loading…') : tr('Class List')}
            </button>
          )}

          {/* Print Class — opens a multi-select picker */}
          {publishedClasses.length > 0 && activeTerm && (
            <button
              disabled={printing || pickerBusy}
              onClick={() => setClassPicker('printClass')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 border border-border text-foreground hover:bg-muted">
              <Printer size={14} />
              {printing ? tr('Loading…') : tr('Print Class')}
            </button>
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
        {visibleTerms.map(term => (
          <button key={term.id} onClick={() => handleFilterChange(term.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filterTermId === term.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}
          >
            {term.name} {term.isCurrent ? tr('(Current)') : ''}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={tr('Search student...')}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
            <X size={13} />
          </button>
        )}
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
      ) : filteredCards.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <Search size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{tr('No students match')} &ldquo;{searchQuery}&rdquo;</p>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Decision')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((rc) => (
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
                    {rc.decision === 'PASS' && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">PASS</span>
                    )}
                    {rc.decision === 'REPEAT' && (
                      <span className="text-xs font-semibold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">REPEAT</span>
                    )}
                  </td>
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
                      {(() => {
                        // Excel transcript templates are a university-only feature; the
                        // annual transcript below applies to every school type.
                        const matchedTpl = school?.type === 'UNIVERSITY'
                          ? excelTemplates.find(t => t.classLevels.includes(rc.student.classLevel))
                          : undefined
                        if (matchedTpl) {
                          return (<>
                            <button
                              onClick={() => handlePreviewExcel(rc.student.id, rc.student.classLevel, rc.term.session, rc.student.name)}
                              disabled={loadingPreview === rc.student.id}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition disabled:opacity-40"
                              title={tr('Preview transcript')}>
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleDownloadExcel(rc.student.id, rc.student.classLevel, rc.term.session, rc.student.name)}
                              disabled={downloadingExcel === rc.student.id}
                              className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded transition disabled:opacity-40"
                              title={tr('Download Excel Transcript')}>
                              <FileSpreadsheet size={14} />
                            </button>
                          </>)
                        }
                        // The annual transcript is a year-end document — its action only
                        // lives on the rows of the period that CLOSES the year (second
                        // semester at a university, third term everywhere else).
                        if (!rc.isFinalTerm) return null
                        const isUni = school?.type === 'UNIVERSITY'
                        return (
                          <button
                            onClick={() => router.push(`/report-cards/transcript/${rc.student.id}?session=${encodeURIComponent(rc.term.session)}`)}
                            disabled={!rc.transcriptReady}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                            title={rc.transcriptReady
                              ? tr(isUni ? 'Print Annual Transcript' : 'Print Annual Report')
                              : tr(isUni
                                  ? 'Annual transcript is available once every semester of the year is published'
                                  : 'Annual report is available once every term of the year is published')}>
                            <Scroll size={14} />
                          </button>
                        )
                      })()}
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
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
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
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Student')} <span className="text-destructive">*</span></label>
                <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">{tr('Select student...')}</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.classLevel}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground dark:text-foreground mb-1">{tr('Term')} <span className="text-destructive">*</span></label>
                <select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })} required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">{tr('Select term...')}</option>
                  {visibleTerms.map(t => <option key={t.id} value={t.id}>{t.name} — {t.session}</option>)}
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

      {/* Excel transcript preview modal */}
      {excelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setExcelPreview(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="font-semibold text-foreground">{excelPreview.studentName}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{tr('Transcript preview')} · {excelPreview.session}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { handleDownloadExcel(excelPreview.studentId, excelPreview.classLevel, excelPreview.session, excelPreview.studentName); setExcelPreview(null) }}
                  disabled={downloadingExcel === excelPreview.studentId}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                  <FileSpreadsheet size={14} /> {tr('Download Excel')}
                </button>
                <button onClick={() => setExcelPreview(null)} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <div dangerouslySetInnerHTML={{ __html: excelPreview.html }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <ClassPickerModal
        open={classPicker === 'publish'}
        title={tr('Publish report cards')}
        subtitle={tr('Select the class(es) to publish for this term.')}
        options={unpublishedClasses.map((cl): ClassOption => ({ classLevel: cl, readiness: classReadiness[cl] }))}
        showReadiness
        confirmLabel={tr('Publish')}
        busy={pickerBusy}
        onClose={() => setClassPicker(null)}
        onConfirm={handleBulkPublishMany}
      />
      <ClassPickerModal
        open={classPicker === 'classList'}
        title={tr('Print class list')}
        subtitle={tr('Select the class(es) to print.')}
        options={[...new Set([...unpublishedClasses, ...publishedClasses])].sort().map((cl): ClassOption => ({ classLevel: cl }))}
        confirmLabel={tr('Print')}
        busy={pickerBusy}
        onClose={() => setClassPicker(null)}
        onConfirm={handlePrintClassListMany}
      />
      <ClassPickerModal
        open={classPicker === 'printClass'}
        title={tr('Print report cards')}
        subtitle={tr('Select the class(es) to print.')}
        options={publishedClasses.map((cl): ClassOption => ({ classLevel: cl }))}
        confirmLabel={tr('Print')}
        busy={pickerBusy}
        onClose={() => setClassPicker(null)}
        onConfirm={handleClassPrintMany}
      />

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

      {printJob && typeof document !== 'undefined' && createPortal(
        <div className="rc-print-portal">
          {printJob.cards.map((rc, i) => (
            <div key={rc.id} style={i < printJob.cards.length - 1 ? { pageBreakAfter: 'always' } : undefined}>
              <PrintableReportCard
                school={{ name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null, stamp: school?.stamp ?? null, language: school?.language, email: school?.email, phone: school?.phone, address: school?.address, website: school?.website, authorizationNumber: school?.authorizationNumber, officialLeftTextEn: school?.officialLeftTextEn, officialLeftTextFr: school?.officialLeftTextFr, officialRightTextEn: school?.officialRightTextEn, officialRightTextFr: school?.officialRightTextFr }}
                student={{ name: rc.student.name, studentId: rc.student.studentId, classLevel: rc.student.classLevel, guardianName: rc.student.guardianName, gender: rc.student.gender }}
                term={{ name: rc.term.name, session: rc.term.session }}
                subjects={rc.entries.map(e => ({ id: e.subject.id, name: e.subject.name, coefficient: e.subject.coefficient, credit: e.subject.credit }))}
                entries={rc.entries.map(e => ({ subjectId: e.subject.id, score: e.score, seq1Score: e.seq1Score ?? null, seq2Score: e.seq2Score ?? null, resitScore: e.resitScore ?? null, grade: e.grade, remarks: e.remarks ?? '' } as PrintEntry))}
                generalRemarks={rc.remarks ?? ''}
                generalRemarksFr={rc.remarksFr ?? ''}
                average={rc.average ?? 0}
                position={rc.position ?? null}
                classSize={rc.classSize ?? undefined}
                classAverage={rc.classAverage ?? undefined}
                annualAverage={rc.annualAverage ?? undefined}
                annualPosition={rc.annualPosition ?? undefined}
                annualClassSize={rc.annualClassSize ?? undefined}
                config={printJob.config}
                variant={printJob.variant}
                gradeBands={gradeBands}
              />
            </div>
          ))}
        </div>,
        document.body,
      )}

      {classListPrintData && typeof document !== 'undefined' && createPortal(
        <div className="classlist-print-portal" dangerouslySetInnerHTML={{ __html: classListPrintPortalHtml(classListPrintData) }} />,
        document.body,
      )}
    </div>
    </DesktopOnly>
  )
}
