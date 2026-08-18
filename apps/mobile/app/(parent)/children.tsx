import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyChildren, ParentChild } from '@/lib/api/parent'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  intro: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 16, lineHeight: 19 },
  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 14, marginBottom: 10,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.brassInk },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardsLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  cardsText: { fontSize: 12, color: colors.textSecondary },
  statusBadge: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a',
  },
  statusText: { fontSize: 10, fontWeight: '700', color: '#b45309' },
})

/**
 * Every child this parent is linked to, across schools.
 *
 * "Across schools" is the reason this is a list and not a single home screen: one parent
 * commonly has a child in the primary and another in the secondary, and those are separate
 * School rows here.
 */
export default function ParentHomeScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const router = useRouter()

  const [children, setChildren] = useState<ParentChild[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const data = await getMyChildren()
      setChildren(data.children)
      setError('')
    } catch {
      setError(t('Could not load your children. Pull down to try again.'))
    }
  }, [t])

  // Refetched on focus rather than only on mount: a card published while the app sat in the
  // background should be there when the parent comes back to this screen.
  useFocusEffect(useCallback(() => {
    let cancelled = false
    setLoading(true)
    fetchAll().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchAll]))

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchAll().finally(() => setRefreshing(false))
  }, [fetchAll])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brassInk} /></View>
  }

  const initials = (name: string) =>
    name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <View style={styles.container}>
      <FlatList
        data={children}
        keyExtractor={(c) => c.id}
        contentContainerStyle={children.length === 0 ? { flex: 1 } : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brassInk} />}
        ListHeaderComponent={children.length > 0
          ? <Text style={[styles.intro, { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 12 }]}>
              {t('Report cards the school has published, and what is left to pay.')}
            </Text>
          : null}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={30} color={colors.textFaint} />
            <Text style={styles.emptyText}>
              {error || t('No children are linked to this account yet. Ask the school to link your child.')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => router.push(`/(parent)/child/${item.id}`)}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.name)}</Text></View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {item.className} · {item.school.name}
              </Text>
              <View style={styles.cardsLine}>
                <Ionicons name="document-text-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.cardsText}>
                  {item.publishedCards === 0
                    ? t('No report card published yet')
                    : `${item.publishedCards} ${item.publishedCards === 1 ? t('report card') : t('report cards')}`}
                </Text>
              </View>
              {/* A child who has left keeps every card they earned, so they stay on the list
                  with their status shown rather than quietly disappearing. */}
              {!item.active && (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>
                    {item.status === 'DISMISSED' ? t('Dismissed') : t('Not active')}
                  </Text>
                </View>
              )}
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      />
    </View>
  )
}
