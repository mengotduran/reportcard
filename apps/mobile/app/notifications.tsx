import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, AppNotification } from '@/lib/api/notifications'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT, useLocaleCode } from '@/lib/i18n'

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
})

export default function NotificationsScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const locale = useLocaleCode()
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

  const onRefresh = () => { setRefreshing(true); load() }

  const handlePress = async (n: AppNotification) => {
    if (n.readAt) return
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    try { await markNotificationRead(n.id) } catch { /* local state already updated; next load reconciles */ }
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
          return (
            <TouchableOpacity
              style={[styles.row, unread && styles.rowUnread]}
              onPress={() => handlePress(n)}
              activeOpacity={unread ? 0.7 : 1}
            >
              <View style={[styles.dot, !unread && styles.dotRead]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(n.title)}</Text>
                <Text style={styles.rowBody}>{n.body}</Text>
                <Text style={styles.rowTime}>{formatTime(n.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}
