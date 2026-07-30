'use client'

import { useMemo, useState } from 'react'
import { Programme, PROGRAMME_LABELS, programmeFromName } from '@/lib/programme'
import { useT } from '@/lib/i18n'

/**
 * Day/Evening filtering for any screen that lists classes.
 *
 * Shared rather than reimplemented per page for one specific reason: these screens work
 * with class NAME strings (`Student.classLevel`, `Subject.classLevel`), not class rows, so
 * each one would otherwise have to rebuild the name-to-sitting lookup, and any page that
 * got it slightly wrong would quietly show one cohort's students under the other's.
 */
export function useProgrammeFilter(classLevels: { name: string; programme?: Programme }[]) {
  const [programme, setProgramme] = useState<Programme | 'ALL'>('ALL')

  const byName = useMemo(
    () => new Map(classLevels.map((c) => [c.name, c.programme ?? 'DAY'] as const)),
    [classLevels],
  )

  // Only worth showing the filter at all once the school runs an evening sitting.
  const hasEvening = useMemo(() => [...byName.values()].some((p) => p === 'EVENING'), [byName])

  /** The class row is the source of truth; the name marker is only a fallback for a class
   *  this screen hasn't loaded (a student whose class was since renamed, say). */
  const programmeOf = (className: string): Programme => byName.get(className) ?? programmeFromName(className)

  const matches = (className: string): boolean => programme === 'ALL' || programmeOf(className) === programme

  return { programme, setProgramme, hasEvening, programmeOf, matches }
}

/**
 * Marks a row or card as belonging to the evening section.
 *
 * Shared rather than repeated because it is the ONLY thing distinguishing two cohorts that
 * are otherwise identical on screen: same programme name, same level, same course names. Any
 * list that strips the "(Evening)" marker for display, as most do, needs this in its place or
 * the two sittings become one undifferentiated list.
 */
export function EveningBadge({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 ${className}`}>
      {t('Evening')}
    </span>
  )
}

export function ProgrammeChips({
  value,
  onChange,
  counts,
  className = '',
}: {
  value: Programme | 'ALL'
  onChange: (p: Programme | 'ALL') => void
  counts?: Partial<Record<Programme | 'ALL', number>>
  className?: string
}) {
  const t = useT()
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {(['ALL', 'DAY', 'EVENING'] as const).map((p) => {
        const active = value === p
        const count = counts?.[p]
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 active:scale-95 ${
              active ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-hover/70'
            }`}
          >
            {t(p === 'ALL' ? 'All' : PROGRAMME_LABELS[p])}
            {count != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
