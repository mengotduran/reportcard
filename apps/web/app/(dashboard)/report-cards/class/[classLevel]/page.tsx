'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSubjectsApi } from '@/lib/api/subjects'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { seqFull } from '@/lib/sequences'

interface Subject { id: string; name: string; classLevel: string }

export default function ClassSubjectsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const termId = searchParams.get('termId') ?? ''
  const termName = searchParams.get('termName') ?? ''

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSeq, setSelectedSeq] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSubjectsApi()
      .then((data) => setSubjects(data.subjects.filter((s: Subject) => s.classLevel === classLevel)))
      .finally(() => setLoading(false))
  }, [classLevel])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{classLevel}</h2>
          <p className="text-sm text-muted-foreground">Select a sequence and subject to enter marks</p>
        </div>
      </div>

      {/* Sequence selector */}
      <div className="bg-card rounded-xl border border-border p-5 mb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Select Sequence</p>
        <div className="flex gap-3">
          {[0, 1].map((i) => (
            <button key={i} onClick={() => setSelectedSeq(i)}
              className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition ${
                selectedSeq === i
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-border'
              }`}>
              {seqFull(termName, i)}
            </button>
          ))}
        </div>
      </div>

      {/* Subject list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-muted">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subjects</p>
        </div>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading subjects...</div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No subjects found for {classLevel}
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
    </div>
  )
}
