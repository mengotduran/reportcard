// app/(tabs)/students.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TextInput, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getStudents, createStudent, updateStudent, deleteStudent, Student } from '@/lib/api/students'
import { getClasses, ClassLevel } from '@/lib/api/classes'
import { getSubjects } from '@/lib/api/reportcards'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { shareCsv } from '@/lib/csv'
import StudentFeesModal from '@/components/StudentFeesModal'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 10 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, backgroundColor: colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: 'transparent' },
  exportBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 4 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  exportText: { fontSize: 12, fontWeight: '600', color: '#F03E2F' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#F03E2F', fontWeight: 'bold', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgeInactive: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: '#16a34a' },
  badgeTextInactive: { color: '#dc2626' },
  errorText: { color: '#ef4444', fontSize: 14 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#F03E2F', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#F03E2F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  detailTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  detailAvatar: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12,
  },
  detailAvatarText: { fontSize: 28, fontWeight: '800', color: '#F03E2F' },
  detailName: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  detailMeta: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  detailRows: { backgroundColor: colors.bgSecondary, borderRadius: 14, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: '#e5e7eb' },
  detailActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FEF2F1', borderRadius: 12, paddingVertical: 13,
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: '#F03E2F' },
  feesBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#f0fdf4', borderRadius: 12, paddingVertical: 13, marginBottom: 10,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  feesBtnText: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  deleteActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fee2e2', borderRadius: 12, paddingVertical: 13,
  },
  deleteActionText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  formInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: colors.text, backgroundColor: colors.inputBg, marginBottom: 14,
  },
  picker: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  pickerText: { fontSize: 14, color: colors.text },
  dropdownList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, marginBottom: 14, overflow: 'hidden' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemText: { fontSize: 14, color: colors.text },
  genderBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.inputBg },
  genderBtnActive: { borderColor: '#F03E2F', backgroundColor: '#FEF2F1' },
  genderBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  genderBtnTextActive: { color: '#F03E2F' },
  createBtn: { backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

function StudentDetailModal({
  student,
  visible,
  onClose,
  onDelete,
  onEdit,
  onFees,
}: {
  student: Student | null
  visible: boolean
  onClose: () => void
  onDelete: (id: string) => void
  onEdit: (student: Student) => void
  onFees: (student: Student) => void
}) {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  if (!student) return null
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.detailSheet}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{t('Student Details')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.detailAvatar}>
            <Text style={styles.detailAvatarText}>{student.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.detailName}>{student.name}</Text>
          <Text style={styles.detailMeta}>ID: {student.studentId}</Text>
          <View style={styles.detailRows}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Class Level')}</Text>
              <Text style={styles.detailValue}>{student.classLevel}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Gender')}</Text>
              <Text style={styles.detailValue}>{student.gender ? t(student.gender) : '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Guardian')}</Text>
              <Text style={styles.detailValue}>{student.guardianName || '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Status')}</Text>
              <View style={[styles.badge, student.isActive ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={[styles.badgeText, student.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
                  {student.isActive ? t('Active') : t('Inactive')}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.feesBtn} onPress={() => onFees(student)}>
            <Ionicons name="wallet-outline" size={16} color="#16a34a" />
            <Text style={styles.feesBtnText}>{t('School Fees')}</Text>
          </TouchableOpacity>
          <View style={styles.detailActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(student)}>
              <Ionicons name="create-outline" size={16} color="#F03E2F" />
              <Text style={styles.editBtnText}>{t('Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteActionBtn} onPress={() => onDelete(student.id)}>
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.deleteActionText}>{t('Delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function CreateStudentModal({
  visible,
  onClose,
  onCreated,
  classList,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  classList: ClassLevel[]
}) {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const [name, setName] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [gender, setGender] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [creating, setCreating] = useState(false)
  const [classPickerOpen, setClassPickerOpen] = useState(false)

  const reset = () => {
    setName(''); setClassLevel(''); setGender(''); setGuardianName('')
  }

  const handleCreate = async () => {
    if (!name.trim() || !classLevel) {
      Alert.alert(t('Validation'), t('Name and Class Level are required.'))
      return
    }
    if (gender !== 'Male' && gender !== 'Female') {
      Alert.alert(t('Validation'), t('Please select the student\'s gender.'))
      return
    }
    setCreating(true)
    try {
      await createStudent({ name: name.trim(), classLevel, gender, guardianName: guardianName.trim() || undefined })
      reset()
      onClose()
      onCreated()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? t('Failed to create student.'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailSheet, { paddingBottom: 40 }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{t('Add Student')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>{t('Full Name')}</Text>
              <TextInput style={styles.formInput} value={name} onChangeText={setName} placeholder={t('e.g. John Doe')} placeholderTextColor="#9ca3af" autoCapitalize="words" />

              <Text style={styles.formLabel}>{t('Class Level')}</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setClassPickerOpen((v) => !v)}>
                <Text style={[styles.pickerText, !classLevel && { color: colors.textMuted }]}>{classLevel || t('Select class level')}</Text>
                <Ionicons name="chevron-down" size={16} color="#6b7280" />
              </TouchableOpacity>
              {classPickerOpen && (
                <View style={styles.dropdownList}>
                  {classList.map((cl) => (
                    <TouchableOpacity key={cl.id} style={styles.dropdownItem} onPress={() => { setClassLevel(cl.name); setClassPickerOpen(false) }}>
                      <Text style={[styles.dropdownItemText, cl.name === classLevel && { color: '#F03E2F', fontWeight: '700' }]}>{cl.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.formLabel}>{t('Gender')} *</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {['Male', 'Female'].map((g) => (
                  <TouchableOpacity key={g} onPress={() => setGender(g)}
                    style={[styles.genderBtn, gender === g && styles.genderBtnActive]}>
                    <Text style={[styles.genderBtnText, gender === g && styles.genderBtnTextActive]}>{t(g)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>{t('Guardian Name (optional)')}</Text>
              <TextInput style={styles.formInput} value={guardianName} onChangeText={setGuardianName} placeholder={t('e.g. Mrs. Jane Doe')} placeholderTextColor="#9ca3af" autoCapitalize="words" />

              <TouchableOpacity style={[styles.createBtn, creating && styles.disabled]} onPress={handleCreate} disabled={creating}>
                {creating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.createBtnText}>{t('Add Student')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function StudentsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { user } = useAuthStore()
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')

  const [students, setStudents] = useState<Student[]>([])
  const [classList, setClassList] = useState<ClassLevel[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [createVisible, setCreateVisible] = useState(false)
  const [feesStudent, setFeesStudent] = useState<Student | null>(null)
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({})

  const isSuperAdmin = user?.role === 'SUPERADMIN'

  const fetchStudents = useCallback(async () => {
    try {
      const [sData, clData, subData] = await Promise.all([
        getStudents(),
        isAdmin ? getClasses() : Promise.resolve({ classLevels: [] }),
        isAdmin ? getSubjects() : Promise.resolve({ subjects: [] }),
      ])
      setStudents(sData.students)
      if (isAdmin) {
        setClassList((clData as { classLevels: ClassLevel[] }).classLevels.sort((a, b) => a.order - b.order))
        const map: Record<string, string[]> = {}
        for (const s of (subData as { subjects: { name: string; classLevel: string }[] }).subjects) {
          (map[s.classLevel] ??= []).push(s.name)
        }
        setSubjectsByClass(map)
      }
    } catch {
      setError(t('Failed to load students'))
    }
  }, [isAdmin])

  useEffect(() => {
    if (isSuperAdmin) { setLoading(false); return }
    fetchStudents().finally(() => setLoading(false))
  }, [fetchStudents, isSuperAdmin])

  useFocusEffect(useCallback(() => {
    if (isSuperAdmin) return
    fetchStudents()
  }, [fetchStudents]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchStudents()
    setRefreshing(false)
  }

  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.studentId.toLowerCase().includes(search.toLowerCase()) ||
      s.classLevel.toLowerCase().includes(search.toLowerCase())
  )

  const handleDeleteStudent = (id: string) => {
    const student = students.find((s) => s.id === id)
    Alert.alert(
      t('Delete Student'),
      `${t('Delete')} ${student?.name ?? t('this student')}? ${t('This cannot be undone.')}`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStudent(id)
              setDetailVisible(false)
              setStudents((prev) => prev.filter((s) => s.id !== id))
            } catch {
              Alert.alert(t('Error'), t('Failed to delete student.'))
            }
          },
        },
      ]
    )
  }

  const handleEditStudent = (student: Student) => {
    setDetailVisible(false)
    Alert.alert(t('Edit'), t('Full edit is available on the web dashboard for now.'))
  }

  const handleExport = async () => {
    if (filtered.length === 0) return
    try {
      await shareCsv('students', filtered, [
        { label: t('Name'), value: (s) => s.name },
        { label: t('Student ID'), value: (s) => s.studentId },
        { label: t('Class'), value: (s) => s.classLevel },
        { label: t('Subjects'), value: (s) => (subjectsByClass[s.classLevel] || []).join(', ') },
        { label: t('Guardian'), value: (s) => s.guardianName || '' },
        { label: t('Status'), value: (s) => (s.isActive ? t('Active') : t('Inactive')) },
      ])
    } catch { /* user dismissed the share sheet */ }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('Search by name, ID or class...')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9ca3af"
        />
      </View>

      {isAdmin && filtered.length > 0 && (
        <View style={styles.exportBar}>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <Ionicons name="download-outline" size={15} color="#F03E2F" />
            <Text style={styles.exportText}>{t('Export CSV')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>{t('No students found')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              if (isAdmin) {
                setSelectedStudent(item)
                setDetailVisible(true)
              }
            }}
            activeOpacity={isAdmin ? 0.7 : 1}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>ID: {item.studentId} · {item.classLevel}</Text>
            </View>
            <View style={[styles.badge, item.isActive ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.badgeText, item.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
                {item.isActive ? t('Active') : t('Inactive')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />}

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <StudentDetailModal
        student={selectedStudent}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onDelete={handleDeleteStudent}
        onEdit={handleEditStudent}
        onFees={(s) => { setDetailVisible(false); setFeesStudent(s) }}
      />

      {feesStudent && (
        <StudentFeesModal
          studentId={feesStudent.id}
          studentName={feesStudent.name}
          visible={!!feesStudent}
          onClose={() => setFeesStudent(null)}
        />
      )}

      <CreateStudentModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={fetchStudents}
        classList={classList}
      />
    </View>
  )
}
