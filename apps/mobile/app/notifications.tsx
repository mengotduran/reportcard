import { useState, useCallback, useMemo, useEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, AppNotification, NotificationLink } from '@/lib/api/notifications'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { onRealtime } from '@/lib/socket'
import { useT, useLocaleCode } from '@/lib/i18n'

/**
 * The `missed*` route params both timetable screens read, built from a notification's stored
 * link. Returns null when there is nothing to point at, which is what makes a row tappable
 * or not.
 */
function missedParamsFor(link: NotificationLink | null): Record<string, string> | null {
  if (!link?.teacherId) return null
  const params: Record<string, string> = {}
  if (link.timetableSlotId) {
    params.missedSlotId = link.timetableSlotId
    if (link.date) params.missedDate = link.date
    if (link.startTime) params.missedFrom = link.startTime
    if (link.endTime) params.missedTo = link.endTime
  } else if (link.periods && link.dateFrom && link.dateTo) {
    params.missedPeriods = String(link.periods)
    params.missedDateFrom = link.dateFrom
    params.missedDateTo = link.dateTo
  } else if (link.timetableChanged) {
    // See the web twin: this branch exists so the row is tappable at all. Nothing is
    // highlighted because a save can change several classes at once.
    params.timetableChanged = '1'
  } else if (link.reassignedCourses) {
    params.reassignedCourses = link.reassignedCourses
    if (link.reassignedTo) params.reassignedTo = link.reassignedTo
  } else {
    // A link with no period, span or reassignment has nothing to say on the grid.
    return null
  }
  if (link.retracted) params.missedRetracted = '1'
  return params
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  markAllRow: { alignItems: 'flex-end', marginBottom: 8 },
  markAllText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  row: {
    flexDirection: 'row', gap: 10, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10,
  },
  rowUnread: { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  dotRead: { backgroundColor: 'transparent' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  openHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  openHintText: { fontSize: 11, fontWeight: '600', color: colors.primary },
})

export default function NotificationsScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const locale = useLocaleCode()
  const router = useRouter()
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getMyNotifications()
      setNotifications(r.notifications)
    } catch { /* keep last-known list on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Without this the list only refreshed on focus, so a notification arriving while this
  // screen was already open stayed invisible until you navigated away and back.
  useEffect(() => onRealtime('notifications:changed', load), [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handlePress = (n: AppNotification) => {
    // Marking read is fire-and-forget so the navigation is never waiting on the network.
    if (!n.readAt) {
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      markNotificationRead(n.id).catch(() => { /* local state already updated; next load reconciles */ })
    }

    const params = missedParamsFor(n.data)
    if (!params) return
    // The teacher's own timetable when the absence is theirs (an admin logged or removed it
    // for them), the read-only view of that teacher's when it isn't. Sending someone to the
    // teacher-timetable screen for themselves would show the same grid with a needless
    // header, and the tab is only ever the viewer's own.
    const isOwn = n.data?.teacherId === user?.id
    if (isOwn) {
      router.push({ pathname: '/(tabs)/timetable', params } as any)
    } else {
      router.push({
        pathname: '/teacher-timetable',
        params: { ...params, teacherId: n.data!.teacherId!, teacherName: n.data?.teacherName ?? '' },
      } as any)
    }
  }

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    try { await markAllNotificationsRead() } catch { /* next load reconciles */ }
  }

  const hasUnread = notifications.some((n) => !n.readAt)

  const formatTime = (iso: string) => new Date(iso).toLocaleString(locale, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={hasUnread ? (
          <TouchableOpacity style={styles.markAllRow} onPress={handleMarkAll}>
            <Text style={styles.markAllText}>{t('Mark all as read')}</Text>
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t("You're all caught up.")}</Text>
          </View>
        }
        renderItem={({ item: n }) => {
          const unread = !n.readAt
          // A read notification with somewhere to go stays tappable — the timetable is
          // worth reopening long after the message itself has been seen.
          const canOpen = !!missedParamsFor(n.data)
          return (
            <TouchableOpacity
              style={[styles.row, unread && styles.rowUnread]}
              onPress={() => handlePress(n)}
              activeOpacity={unread || canOpen ? 0.7 : 1}
            >
              <View style={[styles.dot, !unread && styles.dotRead]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(n.title)}</Text>
                <Text style={styles.rowBody}>{n.body}</Text>
                <Text style={styles.rowTime}>{formatTime(n.createdAt)}</Text>
                {canOpen && (
                  <View style={styles.openHintRow}>
                    <Ionicons name="calendar-outline" size={12} color={colors.primary} />
                    <Text style={styles.openHintText}>{t('Tap to view the timetable')}</Text>
                  </View>
                )}
              </View>
              {canOpen && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ alignSelf: 'center' }} />}
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}
