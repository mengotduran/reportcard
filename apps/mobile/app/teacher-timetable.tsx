import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getTeacherTimetable, getPeriods, MyTimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getTeacherAbsences, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { buildGridSlots, groupAbsencesBySlot } from '@/lib/timetableGrid'
import WeekGrid from '@/components/WeekGrid'
import MissedPeriodBanner, { MissedParams } from '@/components/MissedPeriodBanner'
import { onRealtime } from '@/lib/socket'

/**
 * A teacher's timetable as the ADMIN sees it, read-only, opened by tapping one of their
 * reported absences. Deliberately NOT the Timetable tab: that tab is the viewer's own
 * timetable, and pointing it at someone else would leave the tab showing the wrong person
 * after navigating away.
 */
export default function TeacherTimetableScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const router = useRouter()
  const params = useLocalSearchParams<MissedParams & { teacherId?: string; teacherName?: string }>()
  const { teacherId, teacherName } = params

  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!teacherId) { setLoading(false); return }
    try {
      const [{ slots: s }, { periods: p }, a] = await Promise.all([
        getTeacherTimetable(teacherId), getPeriods(), getTeacherAbsences(teacherId),
      ])
      setSlots(s); setPeriods(p); setAbsences(a.absences)
    } catch { /* keep last-known data on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [teacherId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Keeps this in step when the absence is deleted or locked from anywhere else.
  useEffect(() => onRealtime('absences:changed', load), [load])

  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots = buildGridSlots(slots, absencesBySlot, {
    t, unknownSubject: t('Unknown subject'),
  })

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{teacherName || t('Timetable')}</Text>
          <Text style={styles.headerSub}>{t('Timetable')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}>
        <MissedPeriodBanner {...params} />

        {slots.length === 0 ? (
          <Text style={styles.emptyText}>{t("This teacher has no timetable set up yet.")}</Text>
        ) : (
          <WeekGrid slots={gridSlots} breaks={periods.filter((p) => p.isBreak)} />
        )}
      </ScrollView>
    </View>
  )
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
    paddingTop: 56, paddingBottom: 14, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 24 },
})
