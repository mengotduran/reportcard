'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getMarksExportApi, MarksExportStudent } from '@/lib/api/reportcards'
import { ArrowLeft, BookOpen, Download } from 'lucide-react'
import { seqFull } from '@/lib/sequences'
import { useT, useLang } from '@/lib/i18n'
import { downloadCsv, datedFilename } from '@/lib/csv'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useAuthStore } from '@/lib/store/auth.store'

interface Subject { id: string; name: string; classLevel: string; term?: string | null }

export default function ClassSubjectsPage() {
  const router = useRouter()
  const t = useT()
  const lang = useLang()
  const params = useParams()
  const searchParams = useSearchParams()
  const { school } = useAuthStore()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const termId = searchParams.get('termId') ?? ''
  const termName = searchParams.get('termName') ?? ''
  const isUniversity = school?.type === 'UNIVERSITY'

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSeq, setSelectedSeq] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    getSubjectsApi()
      // A course scoped to one semester (university) only counts for that semester;
      // a subject with no term (primary/secondary) always counts — see Subject.term.
      .then((data) => setSubjects(data.subjects.filter((s: Subject) => s.classLevel === classLevel && (s.term == null || s.term === termName))))
      .finally(() => setLoading(false))
  }, [classLevel, termName])

  const handleExportMarks = async () => {
    if (!termId) { showToast(t('No term selected'), 'error'); return }
    setExporting(true)
    try {
      const data = await getMarksExportApi(termId, classLevel)
      if (data.students.length === 0) { showToast(t('Nothing to export'), 'error'); return }
      downloadCsv(
        datedFilename(`marks-${classLevel}-${data.term.name}`),
        data.students,
        [
          { label: t('Name'), value: (s) => s.name },
          { label: t('Student ID'), value: (s) => s.studentIdCode },
          ...data.subjects.map((subj) => ({ label: subj, value: (s: MarksExportStudent) => s.scores[subj] ?? '' })),
          { label: t('Average'), value: (s) => (s.average != null ? s.average.toFixed(1) : '') },
          { label: t('Rank'), value: (s) => s.position ?? '' },
        ],
      )
      showToast(t('Export started'))
    } catch {
      showToast(t('Failed to export'), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 mb-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition inline-flex">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-foreground">{classLevel}</h2>
              {isUniversity && termName && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{termName}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('Select a sequence and subject to enter marks')}</p>
          </div>
          <button onClick={handleExportMarks} disabled={exporting}
            className="flex items-center justify-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition flex-shrink-0 sm:ml-auto">
            <Download size={16} /> {exporting ? t('Exporting...') : t('Export marks')}
          </button>
        </div>
      </div>

      {/* Sequence selector */}
      <div className="bg-card rounded-xl border border-border p-5 mb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {isUniversity ? t('Select Assessment') : t('Select Sequence')}
        </p>
        <div className="flex gap-3">
          {(isUniversity ? [0, 1, 2] : [0, 1]).map((i) => (
            <button key={i} onClick={() => setSelectedSeq(i)}
              className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition ${
                selectedSeq === i
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-border'
              }`}>
              {isUniversity ? (i === 0 ? t('CA (30)') : i === 1 ? t('Exam (70)') : t('Resit')) : seqFull(termName, i, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* Subject list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-muted">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t(isUniversity ? 'Courses' : 'Subjects')}</p>
        </div>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">{t(isUniversity ? 'Loading courses...' : 'Loading subjects...')}</div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t(isUniversity ? 'No courses for' : 'No subjects for')} {classLevel}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {subjects.map((subject) => (
              <button key={subject.id}
                onClick={() => router.push(
                  `/report-cards/class/${encodeURIComponent(classLevel)}/${encodeURIComponent(subject.id)}?termId=${termId}&termName=${encodeURIComponent(termName)}&subjectName=${encodeURIComponent(subject.name)}&sequence=${selectedSeq}`
                )}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-primary/10 transition group text-left">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={16} className="text-violet-600" />
                </div>
                <span className="flex-1 font-medium text-foreground">{subject.name}</span>
                <span className="text-primary text-sm group-hover:translate-x-1 transition">→</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
