// app/(tabs)/timetable.tsx
import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyTimetable, getPeriods, MyTimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getMyAbsences, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import WeekGrid, { WeekGridSlot } from '@/components/WeekGrid'
import MissedPeriodBanner, { MissedParams } from '@/components/MissedPeriodBanner'
import { buildGridSlots, groupAbsencesBySlot } from '@/lib/timetableGrid'
import { onRealtime } from '@/lib/socket'


const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const formatOneOffDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3, borderWidth: 1 },
  absentNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb',
    borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10, marginBottom: 14,
  },
  absentNoticeText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 17 },
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
  // Long values (course names run to 40+ characters) get their own line instead of being
  // squeezed against the label, where they used to overlap it and run off the right edge.
  detailRowStacked: {
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 3,
  },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  detailValueStacked: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },
})

export default function TimetableScreen() {
  // Set when this screen was opened from a notification. Only used for things the grid
  // cannot show (a REMOVED absence, a reassigned course) — a live absence is drawn on its own
  // period from the fetched data, never from these params, so it can never outlive the row.
  const missedParams = useLocalSearchParams<MissedParams>()
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
  // Absences for the current record, so a slot already reported shows as such on the grid
  // itself rather than only after opening it from the Attendance list.
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const [{ slots: fetchedSlots }, { periods: fetchedPeriods }] = await Promise.all([
        getMyTimetable(), getPeriods(),
      ])
      setSlots(fetchedSlots)
      setPeriods(fetchedPeriods)
      setLoadFailed(false)
      // Absences are a decoration ON the grid, so they are fetched separately: a failure here
      // must not blank the timetable and make it look like one was never built.
      getMyAbsences().then((a) => setAbsences(a.absences)).catch(() => { /* grid still renders */ })
    } catch { setLoadFailed(true) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // An admin deleting or locking one of these must show up here at once — the grid marks the
  // affected period, so stale data means a period still drawn as absent after it was cleared.
  useEffect(() => onRealtime('absences:changed', load), [load])
  // The slots themselves moved, not just their absence markers. load() refetches both.
  useEffect(() => onRealtime('timetable:changed', load), [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const breakPeriods = periods.filter((p) => p.isBreak)

  // Shared with the admin's read-only view of another teacher, so the two renderings of
  // "this period was reported absent" cannot drift apart. See lib/timetableGrid.
  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots: WeekGridSlot[] = buildGridSlots(slots, absencesBySlot, {
    t, unknownSubject: t('Unknown subject'),
    // Ring the period this screen was opened for.
    focusSlotId: missedParams.missedSlotId,
  })

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
            {absences.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.bgSecondary, borderColor: colors.border, borderStyle: 'dashed' }]} />
                <Text style={styles.legendText}>{t('Reported absent')}</Text>
              </View>
            )}
            <Text style={styles.legendText}>{t('Tap a slot for details')}</Text>
          </View>
        ) : (
          <Text style={[styles.emptyText, { textAlign: 'left', marginBottom: 12 }, loadFailed && { color: '#F03E2F' }]}>
            {loadFailed
              ? t('Could not reach the server. Check your connection and pull to refresh.')
              : t("Your timetable hasn't been set up yet — check back once your admin has built it.")}
          </Text>
        )}

        <MissedPeriodBanner {...missedParams}
          slotGone={!!missedParams.missedSlotId && !loading && !slots.some((s) => s.id === missedParams.missedSlotId)} />

        <WeekGrid
          slots={gridSlots}
          breaks={breakPeriods}
          onSlotClick={(s) => setSelectedSlot(slots.find((x) => x.id === s.id) ?? null)}
        />
      </ScrollView>

      {/* Dates this slot has been reported absent for, resolved when the modal opens. */}
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

                {/* Named per date, because the grid repeats weekly and the block alone
                    cannot say WHICH week was reported. */}
                {(absencesBySlot.get(selectedSlot.id) ?? []).length > 0 && (
                  <View style={styles.absentNotice}>
                    <Ionicons
                      name={(absencesBySlot.get(selectedSlot.id) ?? []).some((a) => !a.isFinal) ? 'alert-circle-outline' : 'close-circle-outline'}
                      size={15}
                      color="#92400e"
                    />
                    <Text style={styles.absentNoticeText}>
                      {(absencesBySlot.get(selectedSlot.id) ?? []).some((a) => !a.isFinal)
                        ? t('Reported absent, this class will not be taught on:')
                        : t('Missed and not taught on:')}
                      {' '}
                      {[...new Set((absencesBySlot.get(selectedSlot.id) ?? []).map((a) => a.date))].sort().join(', ')}
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{selectedSlot.specificDate ? t('Date') : t('Day')}</Text>
                  <Text style={styles.detailValue}>
                    {selectedSlot.specificDate ? formatOneOffDate(selectedSlot.specificDate) : t(dayLabel(selectedSlot.dayOfWeek))}
                  </Text>
                </View>
                {/* A private class can be time-boxed. Without this row a six-week revision
                    class is indistinguishable from a permanent weekly fixture, which is the
                    one thing this screen exists to tell a lecturer. */}
                {!selectedSlot.specificDate && (selectedSlot.startsOn || selectedSlot.endsOn) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Runs')}</Text>
                    <Text style={styles.detailValue}>
                      {selectedSlot.startsOn && selectedSlot.endsOn
                        ? `${formatOneOffDate(selectedSlot.startsOn)} → ${formatOneOffDate(selectedSlot.endsOn)}`
                        : selectedSlot.startsOn
                          ? `${t('From')} ${formatOneOffDate(selectedSlot.startsOn)}`
                          : `${t('Until')} ${formatOneOffDate(selectedSlot.endsOn!)}`}
                    </Text>
                  </View>
                )}
                {/* Which course this private class delivers hours toward, and that course's
                    class — the same two facts a normal course row shows. Stacked, because a
                    course name runs to 40+ characters and squeezing it beside the label made
                    it overlap and run off the right edge. */}
                {!selectedSlot.subjectId && selectedSlot.privateSubjectName && (
                  <View style={styles.detailRowStacked}>
                    <Text style={styles.detailLabel}>{t('Counts toward')}</Text>
                    <Text style={styles.detailValueStacked}>{selectedSlot.privateSubjectName}</Text>
                  </View>
                )}
                {!selectedSlot.subjectId && selectedSlot.privateSubjectClass && (
                  <View style={styles.detailRowStacked}>
                    <Text style={styles.detailLabel}>{t('Class')}</Text>
                    <Text style={styles.detailValueStacked}>{selectedSlot.privateSubjectClass}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('Time')}</Text>
                  <Text style={styles.detailValue}>{selectedSlot.startTime} – {selectedSlot.endTime}</Text>
                </View>
                {selectedSlot.subjectId && (
                  <View style={styles.detailRowStacked}>
                    <Text style={styles.detailLabel}>{t(isUniversity ? 'Course' : 'Subject')}</Text>
                    <Text style={styles.detailValueStacked}>{selectedSlot.subjectName ?? t('Unknown subject')}</Text>
                  </View>
                )}
                {selectedSlot.subjectId && selectedSlot.classLevel && (
                  <View style={styles.detailRowStacked}>
                    <Text style={styles.detailLabel}>{t('Class')}</Text>
                    <Text style={styles.detailValueStacked}>{selectedSlot.classLevel}</Text>
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
