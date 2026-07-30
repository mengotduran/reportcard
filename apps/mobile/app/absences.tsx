import { useState, useCallback, useMemo, useEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyAbsences, deleteAbsence, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { onRealtime } from '@/lib/socket'

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10,
  },
  rowText: { fontSize: 13, color: colors.text },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowHint: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
})

// This teacher's full absence-report history — the "See all" a long "Absences reported"
// card on the Attendance tab hands off to once it has more than a handful of entries, so
// that card stays a fixed, uncluttered size no matter how many absences pile up.
export default function AbsencesScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const router = useRouter()
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getMyAbsences()
      setAbsences(r.absences)
    } catch { /* keep last-known list on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // An admin opening this teacher's list LOCKS these rows (seenByAdmin), which no longer
  // permits a retraction. That is a read on the admin's side, so no notification fires and
  // nothing else would tell this screen — without it the delete button lingers until the
  // teacher happens to reload, and then fails.
  useEffect(() => onRealtime('absences:changed', load), [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleDelete = (id: string) => {
    Alert.alert(t('Remove absence?'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Remove'), style: 'destructive', onPress: async () => {
          try { await deleteAbsence(id); load() } catch (err: any) {
            // The list may simply be stale: an admin can review (locking it) or the grace
            // period can expire while this screen sits open, and the bin stays on screen
            // until something refetches. Show the API's actual reason and reload, so the
            // row corrects itself instead of failing again on the next tap.
            Alert.alert(t('Cannot remove'), err?.response?.data?.message || t('Failed to remove absence'))
            load()
          }
        },
      },
    ])
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={absences}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="calendar-clear-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('No absences reported.')}</Text>
          </View>
        }
        renderItem={({ item: a }) => {
          // Same rule as the Attendance tab: locked once the period's actually over, or
          // once an admin has reviewed it in a prior visit to their list.
          const locked = a.isFinal || a.graceExpired || a.seenByAdmin
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              // Same drill-down as the Attendance tab: open the timetable at this period.
              onPress={() => router.push({
                pathname: '/(tabs)/timetable',
                params: { missedSlotId: a.timetableSlotId, missedDate: a.date, missedFrom: a.startTime, missedTo: a.endTime },
              } as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</Text>
                <Text style={styles.rowSub}>{a.subjectName} · {a.classLevel}</Text>
                {a.seenByAdmin && <Text style={styles.rowHint}>{t('reviewed')}</Text>}
              </View>
              {locked ? (
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              ) : (
                <TouchableOpacity onPress={() => handleDelete(a.id)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}
