import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useT } from '@/lib/i18n'

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
 * What survives here is the two cases with NOTHING on the grid to point at:
 *   a REMOVED absence      the row is gone, so the grid looks entirely ordinary
 *   a REASSIGNED course    its slots are archived, so they are absent from the grid
 */
export default function MissedPeriodBanner(params: MissedParams) {
  const t = useT()
  const retracted = params.missedRetracted === '1'
  const reassigned = !!params.reassignedCourses
  if (!retracted && !reassigned) return null

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
  bannerText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600' },
  bannerTextCancelled: { color: '#166534' },
  bannerTextNeutral: { color: '#52525b' },
})
