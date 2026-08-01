'use client'
import { ArrowLeftRight, CircleCheck, CalendarX, History } from 'lucide-react'
import { useT } from '@/lib/i18n'

/**
 * The archived timetable version that actually holds the period this page was opened for,
 * once a later save has taken it off the current one. Admin-only, because reading history
 * is (`GET /timetable/history` is restricted to SCHOOL_ADMIN / VICE_PRINCIPAL).
 */
export type PastVersion = {
  /** ISO timestamp shared by every slot archived in that one save. */
  archivedAt: string
  /** Whether the grid below is currently showing it rather than the live timetable. */
  showing: boolean
  onToggle: () => void
}

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
 * What survives is the cases with NOTHING on the grid to point at:
 *   a REMOVED absence      the row is gone, so the grid looks entirely ordinary
 *   a REASSIGNED course    its slots are archived, so they are absent from the grid
 *   an ARCHIVED period     a later save took it off the timetable; for an admin this also
 *                          offers the past version that still holds it
 */
export default function MissedPeriodBanner(
  info: MissedInfo & { slotGone?: boolean; pastVersion?: PastVersion | null },
) {
  const t = useT()
  const retracted = info.missedRetracted === '1'
  const reassigned = !!info.reassignedCourses
  // Arrived here naming a period that is no longer on this timetable — the timetable was
  // re-saved since, so that slot is archived. Without this the grid would simply highlight
  // nothing and the click would look broken.
  const gone = !!info.slotGone && !!info.missedSlotId && !retracted && !reassigned
  // The same situation, except the archived version holding it was found and can be shown.
  // A retraction or a reassignment is excluded for the same reason `gone` excludes them:
  // there is no absence left to go and look at.
  const past = info.pastVersion && !retracted && !reassigned ? info.pastVersion : null
  if (!retracted && !reassigned && !gone && !past) return null

  // The absence's own date and time. Shared by both "that period isn't here" wordings, since
  // in neither case can the grid itself name it.
  const when = [info.missedDate, info.missedFrom && info.missedTo ? `${info.missedFrom}–${info.missedTo}` : null]
    .filter(Boolean).join(' · ')

  if (past) {
    const replaced = new Date(past.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 mb-3 text-xs font-semibold text-muted-foreground">
        <History size={15} className="flex-shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          {past.showing
            ? `${t('Past timetable, replaced on')} ${replaced}. ${t('Showing it as it stood when this absence was recorded.')}`
            : t('That period is no longer on this timetable. It was changed after the absence was recorded.')}
          {when ? ` · ${when}` : ''}
        </span>
        <button
          onClick={past.onToggle}
          className="flex-shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-hover transition"
        >
          {past.showing ? t('Current timetable') : t('View that timetable')}
        </button>
      </div>
    )
  }

  if (gone) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 mb-3 text-xs font-semibold text-muted-foreground">
        <CalendarX size={15} className="flex-shrink-0" />
        <span>
          {t('That period is no longer on this timetable. It was changed after the absence was recorded.')}
          {when ? ` \u00b7 ${when}` : ''}
        </span>
      </div>
    )
  }

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
