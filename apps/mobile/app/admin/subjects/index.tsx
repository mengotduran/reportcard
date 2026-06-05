// app/admin/subjects/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getSubjects, createSubject, deleteSubject, Subject } from '@/lib/api/subjects'
import { getClasses, ClassLevel } from '@/lib/api/classes'
import { useTheme, Colors } from '@/lib/useTheme'

interface SectionData { title: string; data: Subject[] }

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  sectionHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  subjectName: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 7, backgroundColor: '#fee2e2', borderRadius: 9 },
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
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  pickerText: { fontSize: 14, color: colors.text },
  dropdownList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
    marginBottom: 14,
    overflow: 'hidden',
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemText: { fontSize: 14, color: colors.text },
  row: { flexDirection: 'row' },
  createBtn: {
    backgroundColor: '#F03E2F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

export default function SubjectsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const [sections, setSections] = useState<SectionData[]>([])
  const [classList, setClassList] = useState<ClassLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [coefficient, setCoefficient] = useState('1')
  const [creating, setCreating] = useState(false)
  const [classPickerOpen, setClassPickerOpen] = useState(false)

  const buildSections = (subjects: Subject[]): SectionData[] => {
    const map: Record<string, Subject[]> = {}
    for (const s of subjects) {
      if (!map[s.classLevel]) map[s.classLevel] = []
      map[s.classLevel].push(s)
    }
    return Object.keys(map).sort().map((cl) => ({ title: cl, data: map[cl] }))
  }

  const fetchData = useCallback(async () => {
    try {
      const [subData, clData] = await Promise.all([getSubjects(), getClasses()])
      setClassList(clData.classLevels.sort((a, b) => a.order - b.order))
      setSections(buildSections(subData.subjects))
    } catch {
      Alert.alert('Error', 'Failed to load subjects.')
    }
  }, [])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const handleCreate = async () => {
    if (!subjectName.trim() || !classLevel) {
      Alert.alert('Validation', 'Subject name and class level are required.')
      return
    }
    setCreating(true)
    try {
      await createSubject({
        name: subjectName.trim(),
        classLevel,
        coefficient: Number(coefficient) || 1,
      })
      setModalVisible(false)
      setSubjectName('')
      setClassLevel('')
      setCoefficient('1')
      await fetchData()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to create subject.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (subject: Subject) => {
    Alert.alert(
      'Delete Subject',
      `Delete "${subject.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubject(subject.id)
              await fetchData()
            } catch {
              Alert.alert('Error', 'Failed to delete subject.')
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No subjects yet</Text>
            <Text style={styles.emptySubText}>Tap + to add a subject</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="book-outline" size={18} color="#F03E2F" />
            </View>
            <View style={styles.info}>
              <Text style={styles.subjectName}>{item.name}</Text>
              <Text style={styles.meta}>Max: {item.maxScore} · Coeff: {item.coefficient}</Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={17} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Subject</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Subject Name</Text>
            <TextInput
              style={styles.input}
              value={subjectName}
              onChangeText={setSubjectName}
              placeholder="e.g. Mathematics"
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            <Text style={styles.label}>Class Level</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setClassPickerOpen((v) => !v)}>
              <Text style={[styles.pickerText, !classLevel && { color: colors.textMuted }]}>
                {classLevel || 'Select class level'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </TouchableOpacity>
            {classPickerOpen && (
              <View style={styles.dropdownList}>
                {classList.map((cl) => (
                  <TouchableOpacity
                    key={cl.id}
                    style={styles.dropdownItem}
                    onPress={() => { setClassLevel(cl.name); setClassPickerOpen(false) }}
                  >
                    <Text style={[styles.dropdownItemText, cl.name === classLevel && { color: '#F03E2F', fontWeight: '700' }]}>
                      {cl.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View>
              <Text style={styles.label}>Coefficient</Text>
              <TextInput
                style={styles.input}
                value={coefficient}
                onChangeText={setCoefficient}
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, creating && styles.disabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>Add Subject</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
