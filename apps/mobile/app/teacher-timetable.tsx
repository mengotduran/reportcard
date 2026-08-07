import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getTeacherTimetable, getPeriods, getTimetableHistory, MyTimetableSlot, TimetablePeriod } from '@/lib/api/timetable'
import { getTeacherAbsences, markAbsencesSeen, TeacherAbsence } from '@/lib/api/teacherAbsence'
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

  // Pure data refresh — no side effect. Used both by the focus effect below AND by the
  // background realtime listeners, which must be able to keep this screen's data current
  // without that ever counting as an admin "reviewing" anything (see markAbsencesSeen).
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

  // The real review action, fired ONLY when this screen genuinely comes into view — never
  // from the background realtime listeners below. expo-router keeps a screen mounted after
  // you navigate away from it (pushed underneath whatever's on top now), so a plain
  // useEffect tied to 'absences:changed' would otherwise fire in the background every time
  // ANYONE in the school reports or retracts an absence, silently marking this teacher's
  // absences "reviewed" the instant they're created — before an admin has looked at anything.
  useFocusEffect(useCallback(() => {
    load()
    if (teacherId) markAbsencesSeen(teacherId).catch(() => {})
  }, [load, teacherId]))

  // Keeps this in step when the absence is deleted or locked from anywhere else. Data-only —
  // deliberately does NOT call markAbsencesSeen (see above).
  useEffect(() => onRealtime('absences:changed', load), [load])
  // The slots themselves moved, not just their absence markers. load() refetches both.
  useEffect(() => onRealtime('timetable:changed', load), [load])

  // ── Archived period: fall back to the version that still holds it ──────────────────
  //
  // An absence outlives the timetable it was reported against (archiving, not deleting, is
  // exactly why the row survives a re-save), so tapping one can land on a slot the current
  // week no longer contains. Rather than a dead end, load the archived version holding it and
  // show THAT week, absence ringed as usual. Twin of the web /teacher-timetable page.
  //
  // Admin-only by construction: `GET /timetable/history` is restricted to SCHOOL_ADMIN /
  // VICE_PRINCIPAL, and only an admin can reach this screen. A teacher tapping the same row
  // lands on their own Timetable tab, which keeps the plain "no longer here" banner.
  const missedSlotId = params.missedSlotId
  const slotArchived = !!missedSlotId && !loading && !slots.some((s) => s.id === missedSlotId)
    // A retraction deleted the absence and a reassignment moved the courses away; in neither
    // case is there anything to go back and look at.
    && params.missedRetracted !== '1' && !params.reassignedCourses

  const [pastSlots, setPastSlots] = useState<{ archivedAt: string; slots: MyTimetableSlot[] } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  // Lets the admin flip back to the schedule in force now, and back again.
  const [showCurrent, setShowCurrent] = useState(false)

  useEffect(() => {
    if (!slotArchived || !teacherId) { setPastSlots(null); return }
    let cancelled = false
    setHistoryLoading(true)
    getTimetableHistory(teacherId)
      .then(({ versions }) => {
        if (cancelled) return
        // A slot id belongs to exactly one version: every save recreates its rows, so there
        // is never a choice to make about which past week to open.
        const v = versions.find((ver) => ver.slots.some((s) => s.id === missedSlotId))
        setPastSlots(v ? { archivedAt: v.archivedAt, slots: v.slots } : null)
      })
      // Purged from history, or the fetch failed: the plain "gone" banner still applies.
      .catch(() => { if (!cancelled) setPastSlots(null) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [slotArchived, teacherId, missedSlotId])

  const viewingPast = !!pastSlots && !showCurrent
  const displaySlots = viewingPast ? pastSlots!.slots : slots

  const absencesBySlot = groupAbsencesBySlot(absences)
  const gridSlots = buildGridSlots(displaySlots, absencesBySlot, {
    t, unknownSubject: t('Unknown subject'),
    // Ring the period this screen was opened for.
    focusSlotId: params.missedSlotId,
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
        <MissedPeriodBanner {...params}
          // Suppressed while the history lookup is in flight, so the dead-end wording
          // doesn't flash before the past version arrives.
          slotGone={slotArchived && !pastSlots && !historyLoading}
          pastVersion={pastSlots ? {
            archivedAt: pastSlots.archivedAt,
            showing: viewingPast,
            onToggle: () => setShowCurrent((c) => !c),
          } : null} />

        {displaySlots.length === 0 ? (
          <Text style={styles.emptyText}>{t("This teacher has no timetable set up yet.")}</Text>
        ) : (
          /* Breaks come from the CURRENT period structure even when an old week is on
             screen: periods aren't versioned, so this is the only structure there is. */
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
