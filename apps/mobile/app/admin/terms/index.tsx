// app/admin/terms/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getTerms, createTerm, setCurrentTerm, deleteTerm, Term } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  card: {
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
  },
  cardCurrent: { borderColor: '#bbf7d0', borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termName: { fontSize: 15, fontWeight: '700', color: colors.text },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  currentBadgeText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  session: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  setCurrentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FEF2F1',
    borderRadius: 10,
  },
  setCurrentText: { fontSize: 13, fontWeight: '600', color: '#F03E2F' },
  deleteBtn: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 10 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 14,
  },
  createBtn: {
    backgroundColor: '#F03E2F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

export default function TermsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const tr = useT()
  const { activeSession, school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  // Universities call terms "semesters" — same data/route, just different wording.
  const tt = (termStr: string, semesterStr: string) => tr(isUniversity ? semesterStr : termStr)
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [termName, setTermName] = useState('')
  const [session, setSession] = useState('')
  const [creating, setCreating] = useState(false)
  const [settingCurrent, setSettingCurrent] = useState<string | null>(null)

  const fetchTerms = useCallback(async () => {
    try {
      const data = await getTerms()
      setTerms(data.terms)
    } catch {
      Alert.alert(tr('Error'), tt('Failed to load terms.', 'Failed to load semesters.'))
    }
  }, [])

  useFocusEffect(useCallback(() => {
    fetchTerms().finally(() => setLoading(false))
  }, [fetchTerms]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchTerms()
    setRefreshing(false)
  }

  const handleCreate = async () => {
    if (!termName.trim() || !session.trim()) {
      Alert.alert(tr('Validation'), tt('Term name and session are required.', 'Semester name and session are required.'))
      return
    }
    setCreating(true)
    try {
      await createTerm({ name: termName.trim(), session: session.trim() })
      setModalVisible(false)
      setTermName('')
      setSession('')
      await fetchTerms()
    } catch (err: any) {
      Alert.alert(tr('Error'), err?.response?.data?.message ?? tt('Failed to create term.', 'Failed to create semester.'))
    } finally {
      setCreating(false)
    }
  }

  const handleSetCurrent = async (term: Term) => {
    Alert.alert(
      tt('Set Current Term', 'Set Current Semester'),
      `"${term.name} (${term.session})" ${tt('as the current active term?', 'as the current active semester?')}`,
      [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Set Current'),
          onPress: async () => {
            setSettingCurrent(term.id)
            try {
              await setCurrentTerm(term.id)
              await fetchTerms()
            } catch {
              Alert.alert(tr('Error'), tt('Failed to set current term.', 'Failed to set current semester.'))
            } finally {
              setSettingCurrent(null)
            }
          },
        },
      ]
    )
  }

  const handleDelete = (term: Term) => {
    Alert.alert(
      tt('Delete Term', 'Delete Semester'),
      `${tr('Delete')} "${term.name} (${term.session})"?`,
      [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTerm(term.id)
              setTerms((prev) => prev.filter((t) => t.id !== term.id))
            } catch {
              Alert.alert(tr('Error'), tt('Failed to delete term.', 'Failed to delete semester.'))
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
        data={terms.filter((tm) => tm.session === activeSession)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{tt('No terms yet', 'No semesters yet')}</Text>
            <Text style={styles.emptySubText}>{tt('Tap + to add a term', 'Tap + to add a semester')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.isCurrent && styles.cardCurrent]}>
            <View style={styles.cardTop}>
              <View style={styles.iconBox}>
                <Ionicons name="calendar-outline" size={20} color={item.isCurrent ? '#16a34a' : '#F03E2F'} />
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.termName}>{item.name}</Text>
                  {item.isCurrent && (
                    <View style={styles.currentBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                      <Text style={styles.currentBadgeText}>{tr('Current')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.session}>{item.session}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {!item.isCurrent && (
                <TouchableOpacity
                  style={styles.setCurrentBtn}
                  onPress={() => handleSetCurrent(item)}
                  disabled={settingCurrent === item.id}
                >
                  {settingCurrent === item.id
                    ? <ActivityIndicator size="small" color="#F03E2F" />
                    : <Text style={styles.setCurrentText}>{tr('Set as Current')}</Text>}
                </TouchableOpacity>
              )}
              {!item.isCurrent && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={17} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => { setSession(activeSession ?? ''); setModalVisible(true) }} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('Add Term', 'Add Semester')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{tt('Term Name', 'Semester Name')}</Text>
            <TextInput
              style={styles.input}
              value={termName}
              onChangeText={setTermName}
              placeholder={tt('e.g. First Term', 'e.g. First Semester')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            <Text style={styles.label}>{tr('Session')}</Text>
            <TextInput
              style={styles.input}
              value={session}
              onChangeText={setSession}
              placeholder={tr('e.g. 2024/2025')}
              placeholderTextColor="#9ca3af"
            />

            <TouchableOpacity
              style={[styles.createBtn, creating && styles.disabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{tt('Create Term', 'Create Semester')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
