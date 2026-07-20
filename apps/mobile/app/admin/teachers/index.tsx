// app/admin/teachers/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getTeachers, deleteTeacher, Teacher } from '@/lib/api/teachers'
import { getDepartments, Department } from '@/lib/api/departments'
import { getClasses } from '@/lib/api/classes'
import { resetUserPasswordApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}". Universities have no real Department table row — mirrors
// deptFromClassName in apps/web/app/(dashboard)/classes/page.tsx.
const univDeptFromClassName = (name: string): string => {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#F03E2F' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgePurple: { backgroundColor: '#f3e8ff' },
  badgeBlue: { backgroundColor: '#FEE2E0' },
  badgeGray: { backgroundColor: colors.bgSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextPurple: { color: '#7c3aed' },
  badgeTextBlue: { color: '#F03E2F' },
  badgeTextGray: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
  },
  resetBtn: {
    padding: 8,
    backgroundColor: '#fff7ed',
    borderRadius: 10,
  },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  emptySubText: { fontSize: 13, color: colors.textMuted },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F03E2F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F03E2F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  deptGrid: { padding: 16, paddingBottom: 100, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deptCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deptIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FEE2E0', justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  deptName: { fontSize: 14, fontWeight: '700', color: colors.text },
  deptCount: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  headerBar: { paddingHorizontal: 16, paddingTop: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
}))

export default function TeachersScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const tr = useT()
  const router = useRouter()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const hasDeptView = isSecondary || isUniversity
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classToDept, setClassToDept] = useState<Record<string, string>>({})
  const [classLevelNames, setClassLevelNames] = useState<string[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  // null = show the department picker (secondary/university only). Primary schools
  // have no department concept, so they skip straight to the plain list.
  const [activeDept, setActiveDept] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTeachers = useCallback(async () => {
    try {
      const [tData, clData, deptData] = await Promise.all([
        getTeachers(),
        hasDeptView ? getClasses() : Promise.resolve({ classLevels: [] }),
        isSecondary ? getDepartments() : Promise.resolve({ departments: [] }),
      ])
      setTeachers(tData.teachers)
      if (hasDeptView) setClassLevelNames(clData.classLevels.map((c) => c.name))
      if (isSecondary) {
        setDepartments(deptData.departments)
        const byId = new Map(deptData.departments.map((d) => [d.id, d.name]))
        setClassToDept(Object.fromEntries(clData.classLevels.map((c) => [c.name, byId.get(c.departmentId ?? '') ?? 'Grammar'])))
      }
    } catch {
      Alert.alert(tr('Error'), tr('Failed to load teachers.'))
    }
  }, [isSecondary, hasDeptView])

  useFocusEffect(useCallback(() => {
    fetchTeachers().finally(() => setLoading(false))
  }, [fetchTeachers]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchTeachers()
    setRefreshing(false)
  }

  // Department picker (secondary/university only): a teacher's department(s) are the
  // union of what they're explicitly placed in (t.departments, set at creation) and
  // what's derived from the classes they're attached to (classLevels) — so they show
  // up the moment they're placed, not only once a subject happens to be assigned. A
  // teacher spanning several departments naturally surfaces under each one.
  const teacherDeptNames = (t: Teacher): string[] => {
    const cls = t.classLevels ?? []
    const derived = isSecondary
      ? cls.map((c) => classToDept[c]).filter((d): d is string => !!d)
      : isUniversity
        ? cls.map((c) => univDeptFromClassName(c))
        : []
    return [...new Set([...(t.departments ?? []), ...derived])]
  }
  const deptNames = isSecondary
    ? departments.map((d) => d.name)
    : isUniversity
      ? [...new Set(classLevelNames.map((c) => univDeptFromClassName(c)))].sort()
      : []
  const deptCards = deptNames.map((name) => ({ name, count: teachers.filter((t) => teacherDeptNames(t).includes(name)).length }))
  const scopedTeachers = hasDeptView && activeDept
    ? teachers.filter((t) => teacherDeptNames(t).includes(activeDept))
    : teachers

  const handleResetPassword = (teacher: Teacher) => {
    Alert.alert(
      tr('Reset Password'),
      `${tr('Send')} ${teacher.name} ${tr('a link to set a new password?')}`,
      [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Send'),
          onPress: async () => {
            try {
              await resetUserPasswordApi(teacher.id)
              Alert.alert(tr('Done'), `${tr('Setup email sent to')} ${teacher.name}.`)
            } catch (e: any) {
              Alert.alert(tr('Error'), e?.response?.data?.message || tr('Failed to reset password.'))
            }
          },
        },
      ]
    )
  }

  const handleDelete = (teacher: Teacher) => {
    Alert.alert(
      tr('Delete Teacher'),
      `${tr('Remove')} ${teacher.name} ${tr('from this school?')}`,
      [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTeacher(teacher.id)
              setTeachers((prev) => prev.filter((t) => t.id !== teacher.id))
            } catch {
              Alert.alert(tr('Error'), tr('Failed to delete teacher.'))
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      {/* Department picker — secondary/university only. The teacher list doesn't
          show until a department is picked, since the point is to browse teachers
          grouped by department rather than one long flat list. */}
      {hasDeptView && activeDept && (
        <View style={styles.backRow}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setActiveDept(null)}>
            <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backText}>{tr('Back to Departments')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {hasDeptView && activeDept && (
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>{activeDept}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : hasDeptView && !activeDept ? (
        <ScrollView
          contentContainerStyle={[styles.deptGrid, deptCards.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {deptCards.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>{tr('No departments yet')}</Text>
            </View>
          ) : (
            deptCards.map((d) => (
              <TouchableOpacity key={d.name} style={styles.deptCard} onPress={() => setActiveDept(d.name)}>
                <View style={styles.deptIconBox}>
                  <Ionicons name="people" size={18} color="#F03E2F" />
                </View>
                <Text style={styles.deptName}>{d.name}</Text>
                <Text style={styles.deptCount}>{d.count} {tr(d.count === 1 ? 'teacher' : 'teachers')}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
      <FlatList
        data={scopedTeachers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{tr('No teachers yet')}</Text>
            <Text style={styles.emptySubText}>{tr('Tap the + button to add a teacher')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, item.role === 'CLASS_MASTER' ? styles.badgePurple : styles.badgeBlue]}>
                  <Text style={[styles.badgeText, item.role === 'CLASS_MASTER' ? styles.badgeTextPurple : styles.badgeTextBlue]}>
                    {item.role === 'CLASS_MASTER' ? tr('Class Master') : tr('Class Teacher')}
                  </Text>
                </View>
                {item.role === 'CLASS_MASTER' && item.masterClassLevel && (
                  <View style={styles.badgeGray}>
                    <Text style={styles.badgeTextGray}>{item.masterClassLevel}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={styles.resetBtn} onPress={() => handleResetPassword(item)}>
                <Ionicons name="key-outline" size={16} color="#ea580c" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/admin/teachers/create' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}
