import { useEffect, useState, useCallback, useMemo } from 'react'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getTeacherClasses, TeacherClassRow } from '@/lib/api/dashboard'
import { getCurrentTerm, CurrentTerm } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const DEPT_PALETTE = ['#F03E2F', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#db2777']

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 4, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 14, marginBottom: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  termBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  termBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  currentBadge: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  currentBadgeText: { color: '#16a34a' },
})

export default function MyCoursesScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const router = useRouter()
  const navigation = useNavigation()
  const { user, school } = useAuthStore()
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isUniversity = school?.type === 'UNIVERSITY'
  const [classes, setClasses] = useState<TeacherClassRow[]>([])
  const [term, setTerm] = useState<CurrentTerm | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    navigation.setOptions({ title: t(isUniversity ? 'Your Courses' : 'Your Classes') })
  }, [navigation, t, isUniversity])

  const fetchAll = useCallback(() => {
    return Promise.all([
      getTeacherClasses().then((r) => setClasses(r.classes)).catch(() => {}),
      getCurrentTerm().then(setTerm).catch(() => {}),
    ])
  }, [])

  useEffect(() => { fetchAll().finally(() => setLoading(false)) }, [fetchAll])
  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  const deptColor = useMemo(() => {
    const seen = new Map<string, string>()
    return (key: string) => {
      if (!seen.has(key)) seen.set(key, DEPT_PALETTE[seen.size % DEPT_PALETTE.length])
      return seen.get(key)!
    }
  }, [classes])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={classes}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="book-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t("You haven't been assigned any classes yet.")}</Text>
          </View>
        }
        renderItem={({ item: c }) => {
          const color = deptColor(c.departmentName ?? c.classLevelName)
          const subtitle = [c.departmentName, c.classLevelName].filter(Boolean).join(' · ')
          const goTo = () => {
            if (c.subjectId && term) {
              router.push(`/marks/${encodeURIComponent(c.subjectId)}?classLevel=${encodeURIComponent(c.classLevelName)}&termId=${term.id}&termName=${encodeURIComponent(term.name)}&subjectName=${encodeURIComponent(c.subjectName ?? '')}&sequence=0` as any)
            } else if (isClassMaster) {
              router.push(`/class-master/${encodeURIComponent(c.classLevelName)}?termId=${term?.id ?? ''}` as any)
            } else {
              router.push('/(tabs)/report-cards')
            }
          }
          const isCurrentTerm = !!c.term && c.term === term?.name
          return (
            <TouchableOpacity style={[styles.row, { borderLeftColor: color }]} onPress={goTo} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{c.subjectName ?? t('Class Oversight')}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
                {!!c.term && (
                  <View style={styles.badgeRow}>
                    <View style={styles.termBadge}>
                      <Text style={styles.termBadgeText}>{t(c.term)}</Text>
                    </View>
                    {isCurrentTerm && (
                      <View style={[styles.termBadge, styles.currentBadge]}>
                        <Text style={[styles.termBadgeText, styles.currentBadgeText]}>{t('Current Semester')}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}
