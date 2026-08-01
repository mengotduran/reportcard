import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useT } from '@/lib/i18n'

/**
 * The archived timetable version that actually holds the period this screen was opened for,
 * once a later save has taken it off the current one. Admin-only, because reading history is
 * (`GET /timetable/history` is restricted to SCHOOL_ADMIN / VICE_PRINCIPAL).
 *
 * Twin of the web PastVersion in apps/web/components/ui/MissedPeriodBanner.tsx.
 */
export type PastVersion = {
  /** ISO timestamp shared by every slot archived in that one save. */
  archivedAt: string
  /** Whether the grid below is currently showing it rather than the live timetable. */
  showing: boolean
  onToggle: () => void
}

/**
 * Route params that say "you got here from a particular absence or reassignment".
 *
 * Every value arrives as a string because that is all expo-router carries.
 */
export type MissedParams = {
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
 * Explains, above the week grid, ONLY what the grid itself cannot show.
 *
 * A live absence is drawn on its own period (greyed, dashed, with the dates noted), so a
 * banner repeating it is redundant — and worse, it was driven by route params rather than
 * data, so it kept announcing "this period will be missed" after the absence had been
 * deleted, and lingered on the tab long after the visit that set it.
 *
 * What survives here is the cases with NOTHING on the grid to point at:
 *   a REMOVED absence      the row is gone, so the grid looks entirely ordinary
 *   a REASSIGNED course    its slots are archived, so they are absent from the grid
 *   an ARCHIVED period     a later save took it off the timetable; for an admin this also
 *                          offers the past version that still holds it
 */
export default function MissedPeriodBanner(
  params: MissedParams & { slotGone?: boolean; pastVersion?: PastVersion | null },
) {
  const t = useT()
  const retracted = params.missedRetracted === '1'
  const reassigned = !!params.reassignedCourses
  // Arrived naming a period that is no longer on this timetable — it was re-saved since,
  // so that slot is archived and the grid has nothing to highlight.
  const gone = !!params.slotGone && !!params.missedSlotId && !retracted && !reassigned
  // The same situation, except the archived version holding it was found and can be shown.
  // A retraction or a reassignment is excluded for the same reason `gone` excludes them:
  // there is no absence left to go and look at.
  const past = params.pastVersion && !retracted && !reassigned ? params.pastVersion : null
  if (!retracted && !reassigned && !gone && !past) return null

  // The absence's own date and time. Shared by both "that period isn't here" wordings, since
  // in neither case can the grid itself name it.
  const when = [params.missedDate, params.missedFrom && params.missedTo ? `${params.missedFrom}–${params.missedTo}` : null]
    .filter(Boolean).join(' · ')

  if (past) {
    const replaced = new Date(past.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    return (
      <View style={[styles.banner, styles.bannerNeutral, styles.bannerStacked]}>
        <View style={styles.bannerRow}>
          <Ionicons name="time-outline" size={16} color="#52525b" />
          <Text style={[styles.bannerText, styles.bannerTextNeutral]}>
            {past.showing
              ? `${t('Past timetable, replaced on')} ${replaced}. ${t('Showing it as it stood when this absence was recorded.')}`
              : t('That period is no longer on this timetable. It was changed after the absence was recorded.')}
            {when ? ` · ${when}` : ''}
          </Text>
        </View>
        {/* Full-width below the text rather than beside it: at phone widths a side button
            squeezes the sentence into a column two words wide. */}
        <TouchableOpacity onPress={past.onToggle} style={styles.bannerButton} activeOpacity={0.7}>
          <Text style={styles.bannerButtonText}>
            {past.showing ? t('Current timetable') : t('View that timetable')}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (gone) {
    return (
      <View style={[styles.banner, styles.bannerNeutral]}>
        <Ionicons name="calendar-outline" size={16} color="#52525b" />
        <Text style={[styles.bannerText, styles.bannerTextNeutral]}>
          {t('That period is no longer on this timetable. It was changed after the absence was recorded.')}
          {when ? ` · ${when}` : ''}
        </Text>
      </View>
    )
  }

  if (reassigned) {
    return (
      <View style={[styles.banner, styles.bannerNeutral]}>
        <Ionicons name="swap-horizontal-outline" size={16} color="#52525b" />
        <Text style={[styles.bannerText, styles.bannerTextNeutral]}>
          {params.reassignedCourses}
          {params.reassignedTo ? ` · ${t('now taught by')} ${params.reassignedTo}` : ''}
          {` · ${t('these periods are no longer on this timetable')}`}
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.banner, styles.bannerCancelled]}>
      <Ionicons name="checkmark-circle-outline" size={16} color="#166534" />
      <Text style={[styles.bannerText, styles.bannerTextCancelled]}>
        {t('This absence report was cancelled')}
        {params.missedDate ? ` · ${params.missedDate}` : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffbeb',
    borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10, marginBottom: 12,
  },
  // A cancelled report is good news, not a warning, so it reads green rather than amber.
  bannerCancelled: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  // A reassignment is neither: it is just what the timetable now looks like.
  bannerNeutral: { backgroundColor: '#f4f4f5', borderColor: '#e4e4e7' },
  // The past-version banner carries an action, so it stacks instead of sitting on one line.
  bannerStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerButton: {
    borderWidth: 1, borderColor: '#d4d4d8', backgroundColor: '#ffffff',
    borderRadius: 8, paddingVertical: 7, alignItems: 'center',
  },
  bannerButtonText: { fontSize: 12, fontWeight: '700', color: '#3f3f46' },
  bannerText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600' },
  bannerTextCancelled: { color: '#166534' },
  bannerTextNeutral: { color: '#52525b' },
})
