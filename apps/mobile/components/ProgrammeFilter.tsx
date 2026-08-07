import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { Programme, PROGRAMME_LABELS, programmeFromName } from '@/lib/programme'

/**
 * Day/Evening filtering for any screen that lists classes, students or report cards.
 *
 * Mirrors the web hook of the same name, and exists for the same reason: these screens work
 * with class NAME strings (`Student.classLevel`), not class rows, so each would otherwise
 * rebuild the name-to-sitting lookup and any screen that got it slightly wrong would quietly
 * show one cohort's students under the other's.
 */
export function useProgrammeFilter(classLevels: { name: string; programme?: Programme }[]) {
  const [programme, setProgramme] = useState<Programme | 'ALL'>('ALL')

  const byName = useMemo(
    () => new Map(classLevels.map((c) => [c.name, c.programme ?? 'DAY'] as const)),
    [classLevels],
  )

  // Only worth showing at all once the school actually runs an evening sitting, so a school
  // with one sitting sees no change anywhere.
  const hasEvening = useMemo(() => [...byName.values()].some((p) => p === 'EVENING'), [byName])

  /** The class row is the source of truth; the name marker is only a fallback for a class
   *  this screen has not loaded. */
  const programmeOf = (className: string): Programme => byName.get(className) ?? programmeFromName(className)

  const matches = (className: string): boolean => programme === 'ALL' || programmeOf(className) === programme

  return { programme, setProgramme, hasEvening, programmeOf, matches }
}

/**
 * Marks a row as belonging to the evening section.
 *
 * The only thing distinguishing two cohorts that are otherwise identical on screen: same
 * programme name, same level, same courses. Every list strips the "(Evening)" marker for
 * display, so without this the two sittings read as one undifferentiated list.
 */
export function EveningBadge() {
  const { isDark } = useTheme()
  const t = useT()
  return (
    <View style={[styles.badge, { backgroundColor: isDark ? '#312e81' : '#e0e7ff' }]}>
      <Text style={[styles.badgeText, { color: isDark ? '#c7d2fe' : '#4338ca' }]}>
        {t('Evening').toUpperCase()}
      </Text>
    </View>
  )
}

export function ProgrammeChips({
  value, onChange, counts,
}: {
  value: Programme | 'ALL'
  onChange: (p: Programme | 'ALL') => void
  counts?: Partial<Record<Programme | 'ALL', number>>
}) {
  const { colors } = useTheme()
  const t = useT()
  return (
    <View style={styles.chips}>
      {(['ALL', 'DAY', 'EVENING'] as const).map((p) => {
        const active = value === p
        const count = counts?.[p]
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
              {t(p === 'ALL' ? 'All' : PROGRAMME_LABELS[p])}
              {count != null ? `  ${count}` : ''}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
})
