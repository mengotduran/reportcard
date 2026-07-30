'use client'
import { ArrowLeftRight, CircleCheck } from 'lucide-react'
import { useT } from '@/lib/i18n'

/**
 * Which absence or reassignment brought the viewer to this timetable, read from the query
 * string. Twin of apps/mobile/components/MissedPeriodBanner.tsx.
 */
export type MissedInfo = {
  missedSlotId?: string
  missedDate?: string
  missedFrom?: string
  missedTo?: string
  missedDateFrom?: string
  missedDateTo?: string
  missedPeriods?: string
  /** '1' when the absence was CANCELLED rather than reported. */
  missedRetracted?: string
  /** Courses that moved to another teacher, and who has them now. */
  reassignedCourses?: string
  reassignedTo?: string
}

/**
 * Pulls the banner's fields out of a query string, so callers don't repeat the names.
 * Typed against the read method alone, which is all `useSearchParams` guarantees.
 */
export function missedInfoFromParams(params: { get(key: string): string | null }): MissedInfo {
  const get = (k: keyof MissedInfo) => params.get(k) ?? undefined
  return {
    missedSlotId: get('missedSlotId'),
    missedDate: get('missedDate'),
    missedFrom: get('missedFrom'),
    missedTo: get('missedTo'),
    missedDateFrom: get('missedDateFrom'),
    missedDateTo: get('missedDateTo'),
    missedPeriods: get('missedPeriods'),
    missedRetracted: get('missedRetracted'),
    reassignedCourses: get('reassignedCourses'),
    reassignedTo: get('reassignedTo'),
  }
}

/**
 * Explains, above the week grid, ONLY what the grid itself cannot show.
 *
 * A live absence is drawn on its own period, so a banner repeating it is redundant — and it
 * was driven by query params rather than data, so it kept announcing "this period will be
 * missed" after the absence had been deleted.
 *
 * What survives is the two cases with NOTHING on the grid to point at:
 *   a REMOVED absence      the row is gone, so the grid looks entirely ordinary
 *   a REASSIGNED course    its slots are archived, so they are absent from the grid
 */
export default function MissedPeriodBanner(info: MissedInfo) {
  const t = useT()
  const retracted = info.missedRetracted === '1'
  const reassigned = !!info.reassignedCourses
  if (!retracted && !reassigned) return null

  if (reassigned) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 mb-3 text-xs font-semibold text-muted-foreground">
        <ArrowLeftRight size={15} className="flex-shrink-0" />
        <span>
          {info.reassignedCourses}
          {info.reassignedTo ? ` \u00b7 ${t('now taught by')} ${info.reassignedTo}` : ''}
          {` \u00b7 ${t('these periods are no longer on this timetable')}`}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-3 text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300">
      <CircleCheck size={15} className="flex-shrink-0" />
      <span>{t('This absence report was cancelled')}{info.missedDate ? ` \u00b7 ${info.missedDate}` : ''}</span>
    </div>
  )
}
