// app/admin/teachers/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getTeachers, deleteTeacher, Teacher } from '@/lib/api/teachers'
import { resetUserPasswordApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

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
}))

export default function TeachersScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const tr = useT()
  const router = useRouter()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTeachers = useCallback(async () => {
    try {
      const data = await getTeachers()
      setTeachers(data.teachers)
    } catch {
      Alert.alert(tr('Error'), tr('Failed to load teachers.'))
    }
  }, [])

  useFocusEffect(useCallback(() => {
    fetchTeachers().finally(() => setLoading(false))
  }, [fetchTeachers]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchTeachers()
    setRefreshing(false)
  }

  const handleResetPassword = (teacher: Teacher) => {
    Alert.prompt(
      tr('Reset Password'),
      `${tr('Set a new password for')} ${teacher.name}`,
      [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Reset'),
          onPress: async (newPassword?: string) => {
            if (!newPassword || newPassword.length < 6) {
              Alert.alert(tr('Error'), tr('Password must be at least 6 characters.'))
              return
            }
            try {
              await resetUserPasswordApi(teacher.id, newPassword)
              Alert.alert(tr('Done'), `${tr('Password updated for')} ${teacher.name}.`)
            } catch (e: any) {
              Alert.alert(tr('Error'), e?.response?.data?.message || tr('Failed to reset password.'))
            }
          },
        },
      ],
      'secure-text'
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
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : (
      <FlatList
        data={teachers}
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
