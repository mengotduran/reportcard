'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getTermsApi } from '@/lib/api/terms'
import { getClassLevelsApi } from '@/lib/api/classLevels'
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

// The two real prerequisites the rest of the app already hard-blocks on
// separately (no current term → can't add students; no class → nothing to
// assign a student to) — surfaced here in one place, in the right order,
// instead of a new admin discovering each one only by hitting a blocked
// action on whatever page they try next. Disappears once both are done;
// nothing to dismiss or persist.
export default function SetupChecklist() {
  const router = useRouter()
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [hasCurrentTerm, setHasCurrentTerm] = useState(false)
  const [hasClasses, setHasClasses] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getTermsApi(), getClassLevelsApi()])
      .then(([termData, classData]) => {
        if (cancelled) return
        setHasCurrentTerm((termData.terms ?? []).some((tm: { isCurrent: boolean }) => tm.isCurrent))
        setHasClasses((classData.classLevels ?? []).length > 0)
      })
      .catch(() => { /* non-fatal — checklist just doesn't render */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading || (hasCurrentTerm && hasClasses)) return null

  const items = [
    { done: hasCurrentTerm, label: t('Set the current academic year/term'), path: '/terms' },
    { done: hasClasses, label: t('Create at least one class'), path: '/classes' },
  ]

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-semibold text-foreground mb-3">{t('Finish setting up your school')}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <button key={item.path} onClick={() => router.push(item.path)}
            className="w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-muted transition group">
            <span className="flex items-center gap-2.5 min-w-0">
              {item.done
                ? <CheckCircle2 size={17} className="text-emerald-500 flex-shrink-0" />
                : <Circle size={17} className="text-muted-foreground flex-shrink-0" />}
              <span className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>{item.label}</span>
            </span>
            {!item.done && <ArrowRight size={15} className="text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />}
          </button>
        ))}
      </div>
    </div>
  )
}
