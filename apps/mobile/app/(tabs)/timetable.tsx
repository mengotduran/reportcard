// app/(tabs)/timetable.tsx
import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyTimetable, getPeriods, MyTimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  dayChips: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  dayChipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  dayChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  dayChipTextActive: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  time: { fontSize: 13, fontWeight: '600', color: '#F03E2F' },
  subject: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  meta: { fontSize: 13, color: colors.textSecondary },
  breakCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  breakText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
})

export default function TimetableScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeDay, setActiveDay] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [{ slots: fetchedSlots }, { periods: fetchedPeriods }] = await Promise.all([getMyTimetable(), getPeriods()])
      setSlots(fetchedSlots)
      setPeriods(fetchedPeriods)
    } catch { /* keep last-known slots on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))
  useEffect(() => { if (!activeDay) setActiveDay(DAYS[0]) }, [])

  const onRefresh = () => { setRefreshing(true); load() }

  // Always show all 7 day chips — the admin hasn't necessarily built anything
  // yet, but the day structure itself should still be there, same as the web
  // "My Timetable" grid always renders its frame even when empty. Breaks are
  // school-wide (same for every teacher), merged into the same sorted list.
  const daySlots = slots.filter((s) => s.dayOfWeek === activeDay)
  const dayBreaks = periods.filter((p) => p.isBreak)
  const dayItems = [
    ...daySlots.map((s) => ({ kind: 'slot' as const, slot: s })),
    ...dayBreaks.map((p) => ({ kind: 'break' as const, period: p })),
  ].sort((a, b) => {
    const aTime = a.kind === 'slot' ? a.slot.startTime : a.period.startTime
    const bTime = b.kind === 'slot' ? b.slot.startTime : b.period.startTime
    return aTime.localeCompare(bTime)
  })

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayChips}>
        {DAYS.map((d) => (
          <TouchableOpacity key={d} onPress={() => setActiveDay(d)}
            style={[styles.dayChip, activeDay === d && styles.dayChipActive]}>
            <Text style={[styles.dayChipText, activeDay === d && styles.dayChipTextActive]}>{t(dayLabel(d))}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {dayItems.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('Nothing scheduled')}</Text>
          </View>
        ) : dayItems.map((item) => item.kind === 'break' ? (
          <View key={`break-${item.period.id}`} style={styles.breakCard}>
            <Ionicons name="cafe-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.breakText}>{t('Break')} · {item.period.startTime} – {item.period.endTime}</Text>
          </View>
        ) : (
          <View key={item.slot.id} style={styles.card}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color="#F03E2F" />
              <Text style={styles.time}>{item.slot.startTime} – {item.slot.endTime}</Text>
            </View>
            <Text style={styles.subject}>{item.slot.subjectId ? (item.slot.subjectName ?? '—') : item.slot.label}</Text>
            <Text style={styles.meta}>
              {item.slot.subjectId ? item.slot.classLevel : t('Private class')}{item.slot.room ? ` · ${item.slot.room}` : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
