// app/(tabs)/timetable.tsx
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyTimetable, getPeriods, MyTimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import WeekGrid, { WeekGridSlot } from '@/components/WeekGrid'

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3, borderWidth: 1 },
  legendText: { fontSize: 11, color: colors.textMuted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, padding: 20,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, marginRight: 12 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
})

export default function TimetableScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<MyTimetableSlot | null>(null)

  const load = useCallback(async () => {
    try {
      const [{ slots: fetchedSlots }, { periods: fetchedPeriods }] = await Promise.all([getMyTimetable(), getPeriods()])
      setSlots(fetchedSlots)
      setPeriods(fetchedPeriods)
    } catch { /* keep last-known slots on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = () => { setRefreshing(true); load() }

  const breakPeriods = periods.filter((p) => p.isBreak)
  const gridSlots: WeekGridSlot[] = slots.map((s) => ({
    id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
    title: s.subjectId ? (s.subjectName ?? t('Unknown subject')) : (s.label ?? ''),
    subtitle: s.subjectId ? s.classLevel : s.room,
    isPrivate: !s.subjectId,
  }))

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {slots.length > 0 ? (
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]} />
              <Text style={styles.legendText}>{t(isUniversity ? 'Course' : 'Subject')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]} />
              <Text style={styles.legendText}>{t('Private class')}</Text>
            </View>
            <Text style={styles.legendText}>{t('Tap a slot for details')}</Text>
          </View>
        ) : (
          <Text style={[styles.emptyText, { textAlign: 'left', marginBottom: 12 }]}>
            {t("Your timetable hasn't been set up yet — check back once your admin has built it.")}
          </Text>
        )}

        <WeekGrid
          slots={gridSlots}
          breaks={breakPeriods}
          onSlotClick={(s) => setSelectedSlot(slots.find((x) => x.id === s.id) ?? null)}
        />
      </ScrollView>

      <Modal visible={!!selectedSlot} transparent animationType="fade" onRequestClose={() => setSelectedSlot(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedSlot(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            {selectedSlot && (
              <>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle} numberOfLines={2}>
                    {selectedSlot.subjectId ? (selectedSlot.subjectName ?? t('Unknown subject')) : (selectedSlot.label ?? t('Private class'))}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedSlot(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('Day')}</Text>
                  <Text style={styles.detailValue}>{t(dayLabel(selectedSlot.dayOfWeek))}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('Time')}</Text>
                  <Text style={styles.detailValue}>{selectedSlot.startTime} – {selectedSlot.endTime}</Text>
                </View>
                {selectedSlot.subjectId && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t(isUniversity ? 'Course' : 'Subject')}</Text>
                    <Text style={styles.detailValue}>{selectedSlot.subjectName ?? t('Unknown subject')}</Text>
                  </View>
                )}
                {selectedSlot.subjectId && selectedSlot.classLevel && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Class')}</Text>
                    <Text style={styles.detailValue}>{selectedSlot.classLevel}</Text>
                  </View>
                )}
                {selectedSlot.room && (
                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.detailLabel}>{t('Room')}</Text>
                    <Text style={styles.detailValue}>{selectedSlot.room}</Text>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}
