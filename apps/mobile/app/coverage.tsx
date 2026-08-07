import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyCoverage, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { formatHours } from '@/lib/formatHours'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

const STATUS_COLOR: Record<CoverageStatus, string> = {
  NO_TARGET: '#6b7280', UNDER: '#ef4444', EXACT: '#16a34a', OVER: '#d97706',
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  subject: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  meta: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
})

// This teacher's full per-course coverage list — the "See all" the Attendance tab hands off
// to once there's more than one course, so that tab stays a fixed, uncluttered size no
// matter how many subjects this teacher is on. Same data (getMyCoverage) as the one card
// still shown there, just every row instead of one.
export default function CoverageScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const { user } = useAuthStore()
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getMyCoverage()
      setRows(r.rows)
    } catch { /* keep last-known list on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = () => { setRefreshing(true); load() }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.subjectId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="time-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('No required-hours target has been set for any of your subjects yet.')}</Text>
          </View>
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.subject}>{r.subjectName}</Text>
            <Text style={styles.meta}>{r.classLevel}{r.term ? ` · ${r.term}` : ''}</Text>
            <View style={styles.statsRow}>
              <View><Text style={styles.statLabel}>{t('Required')}</Text><Text style={styles.statValue}>{r.requiredHours != null ? formatHours(r.requiredHours) : '—'}</Text></View>
              <View><Text style={styles.statLabel}>{t('Taught so far')}</Text><Text style={styles.statValue}>{formatHours(r.taughtHours)}</Text></View>
              <View><Text style={styles.statLabel}>{r.isFinal ? t('Final') : t('Projected')}</Text><Text style={styles.statValue}>{formatHours(r.projectedFinalHours)}</Text></View>
            </View>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
              <Text style={styles.badgeText}>{t(r.status)}</Text>
            </View>
            {/* Same "your share" note as the Attendance tab's own card — see that file for why. */}
            {(() => {
              const mine = r.contributors.find((c) => c.teacherId === user?.id)
              if (!mine || r.contributors.length < 2) return null
              return (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
                  {t('You taught')} {formatHours(mine.taughtHours)} {t('of this')} · {r.contributors.length} {t('teachers on this course')}
                </Text>
              )
            })()}
          </View>
        )}
      />
    </View>
  )
}
