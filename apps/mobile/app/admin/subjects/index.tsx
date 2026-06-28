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
import { getTerms, Term } from '@/lib/api/terms'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

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
  const t = useT()
  const { school, activeSession } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  // Universities call subjects "courses" and classes "departments" — same data/routes, just different wording.
  const tt = (subjectStr: string, courseStr: string) => t(isUniversity ? courseStr : subjectStr)
  const tc = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [sections, setSections] = useState<SectionData[]>([])
  const [classList, setClassList] = useState<ClassLevel[]>([])
  const [termList, setTermList] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [term, setTerm] = useState('')
  const [coefficient, setCoefficient] = useState('1')
  const [credit, setCredit] = useState('')
  const [creating, setCreating] = useState(false)
  const [classPickerOpen, setClassPickerOpen] = useState(false)
  const [termPickerOpen, setTermPickerOpen] = useState(false)

  // University: a course belongs to one semester, so group/label sections by
  // department + semester (see Subject.term in schema.prisma). Other types:
  // group by class only, exactly as before.
  const buildSections = (subjects: Subject[]): SectionData[] => {
    const map: Record<string, Subject[]> = {}
    const keyOf = (s: Subject) => isUniversity ? `${s.classLevel} — ${s.term ?? t('No semester')}` : s.classLevel
    for (const s of subjects) {
      const key = keyOf(s)
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return Object.keys(map).sort().map((key) => ({ title: key, data: map[key] }))
  }

  const fetchData = useCallback(async () => {
    try {
      const [subData, clData, termData] = await Promise.all([getSubjects(), getClasses(), getTerms()])
      setClassList(clData.classLevels.sort((a, b) => a.order - b.order))
      // Distinct semester names within the active academic session.
      const seen = new Set<string>()
      setTermList(termData.terms.filter((tm) => tm.session === activeSession && !seen.has(tm.name) && seen.add(tm.name)))
      setSections(buildSections(subData.subjects))
    } catch {
      Alert.alert(t('Error'), tt('Failed to load subjects.', 'Failed to load courses.'))
    }
  }, [activeSession, isUniversity])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const handleCreate = async () => {
    if (!subjectName.trim() || !classLevel || (isUniversity ? (!term || !credit) : false)) {
      Alert.alert(t('Validation'), isUniversity ? t('Course name, department, semester, and credit are required.') : t('Subject name and class level are required.'))
      return
    }
    setCreating(true)
    try {
      await createSubject({
        name: subjectName.trim(),
        classLevel,
        // Universities don't enter a separate coefficient — credit hours double as
        // the weight in the average, same value the seed already uses for this.
        coefficient: isUniversity ? (Number(credit) || 1) : (Number(coefficient) || 1),
        ...(isUniversity ? { term, credit: Number(credit) } : {}),
      })
      setModalVisible(false)
      setSubjectName('')
      setClassLevel('')
      setTerm('')
      setCoefficient('1')
      setCredit('')
      await fetchData()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? tt('Failed to create subject.', 'Failed to create course.'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (subject: Subject) => {
    Alert.alert(
      tt('Delete Subject', 'Delete Course'),
      `${t('Delete')} "${subject.name}"?`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubject(subject.id)
              await fetchData()
            } catch {
              Alert.alert(t('Error'), tt('Failed to delete subject.', 'Failed to delete course.'))
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
            <Text style={styles.emptyText}>{tt('No subjects yet', 'No courses yet')}</Text>
            <Text style={styles.emptySubText}>{tt('Tap + to add a subject', 'Tap + to add a course')}</Text>
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
              <Text style={styles.meta}>{t('Max:')} {item.maxScore} · {isUniversity ? `${t('Credit:')} ${item.credit ?? '—'}` : `${t('Coeff:')} ${item.coefficient}`}</Text>
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
              <Text style={styles.modalTitle}>{tt('Add Subject', 'Add Course')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{tt('Subject Name', 'Course Name')}</Text>
            <TextInput
              style={styles.input}
              value={subjectName}
              onChangeText={setSubjectName}
              placeholder={isUniversity ? t('e.g. Calculus I') : t('e.g. Mathematics')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            <Text style={styles.label}>{tc('Class Level', 'Department')}</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setClassPickerOpen((v) => !v)}>
              <Text style={[styles.pickerText, !classLevel && { color: colors.textMuted }]}>
                {classLevel || tc('Select class level', 'Select department')}
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

            {isUniversity && (
              <>
                <Text style={styles.label}>{t('Semester')}</Text>
                <TouchableOpacity style={styles.picker} onPress={() => setTermPickerOpen((v) => !v)}>
                  <Text style={[styles.pickerText, !term && { color: colors.textMuted }]}>
                    {term || t('Select semester')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </TouchableOpacity>
                {termPickerOpen && (
                  <View style={styles.dropdownList}>
                    {termList.map((tm) => (
                      <TouchableOpacity
                        key={tm.id}
                        style={styles.dropdownItem}
                        onPress={() => { setTerm(tm.name); setTermPickerOpen(false) }}
                      >
                        <Text style={[styles.dropdownItemText, tm.name === term && { color: '#F03E2F', fontWeight: '700' }]}>
                          {tm.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {!isUniversity && (
              <View>
                <Text style={styles.label}>{t('Coefficient')}</Text>
                <TextInput
                  style={styles.input}
                  value={coefficient}
                  onChangeText={setCoefficient}
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            {isUniversity && (
              <View>
                <Text style={styles.label}>{t('Credit hours')}</Text>
                <TextInput
                  style={styles.input}
                  value={credit}
                  onChangeText={setCredit}
                  placeholder="e.g. 3"
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.createBtn, creating && styles.disabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{tt('Add Subject', 'Add Course')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
