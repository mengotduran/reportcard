// app/(tabs)/students.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TextInput, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { getStudents, createStudent, updateStudent, setStudentStatus, Student, StudentStatus, previewStudentImportApi, commitStudentImportApi, ImportPreviewResult, CarryOverRow } from '@/lib/api/students'
import { getClasses, ClassLevel } from '@/lib/api/classes'
import { getSubjects } from '@/lib/api/reportcards'
import { getTerms } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { shareCsv } from '@/lib/csv'
import StudentFeesModal from '@/components/StudentFeesModal'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const STATUS_TABS: StudentStatus[] = ['ACTIVE', 'DISABLED', 'DISMISSED']

// Older cached data may not carry `status` yet — fall back to isActive so a
// stale client still renders a sensible badge instead of crashing.
const effectiveStatus = (s: Student): StudentStatus => s.status ?? (s.isActive ? 'ACTIVE' : 'DISABLED')

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
  badgeDisabled: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: '#16a34a' },
  badgeTextInactive: { color: '#dc2626' },
  badgeTextDisabled: { color: '#b45309' },
  statusTabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  statusTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statusTabActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  statusTabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  statusTabTextActive: { color: '#fff' },
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
  onChangeStatus,
  onEdit,
  onFees,
}: {
  student: Student | null
  visible: boolean
  onClose: () => void
  onChangeStatus: (student: Student) => void
  onEdit: (student: Student) => void
  onFees: (student: Student) => void
}) {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  if (!student) return null
  const status = effectiveStatus(student)
  const badgeBox = status === 'ACTIVE' ? styles.badgeActive : status === 'DISABLED' ? styles.badgeDisabled : styles.badgeInactive
  const badgeText = status === 'ACTIVE' ? styles.badgeTextActive : status === 'DISABLED' ? styles.badgeTextDisabled : styles.badgeTextInactive
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
              <View style={[styles.badge, badgeBox]}>
                <Text style={[styles.badgeText, badgeText]}>
                  {t(status === 'ACTIVE' ? 'Active' : status === 'DISABLED' ? 'Disabled' : 'Dismissed')}
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
            <TouchableOpacity style={styles.deleteActionBtn} onPress={() => onChangeStatus(student)}>
              <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
              <Text style={styles.deleteActionText}>{t('Change Status')}</Text>
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

function ImportStudentsModal({
  visible,
  onClose,
  onImported,
  isUniversity,
}: {
  visible: boolean
  onClose: () => void
  onImported: () => void
  isUniversity: boolean
}) {
  const { colors } = useTheme()
  const t = useT()
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [importError, setImportError] = useState('')

  const reset = () => {
    setPreview(null); setFileName(''); setImportError('')
  }

  const handleClose = () => { reset(); onClose() }

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
        ],
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.length) return
      const asset = result.assets[0]
      setFileName(asset.name)
      setImportError('')
      setPreview(null)
      setPreviewing(true)
      try {
        const mimeType = asset.mimeType ?? (asset.name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        const data = await previewStudentImportApi(asset.uri, asset.name, mimeType)
        setPreview(data)
      } catch (err: any) {
        setImportError(err?.response?.data?.message ?? t('Failed to read that file. Make sure it is a valid .xlsx or .csv file.'))
      } finally {
        setPreviewing(false)
      }
    } catch { /* user cancelled */ }
  }

  const handleCommit = async () => {
    if (!preview || preview.valid.length === 0) return
    setCommitting(true)
    try {
      const result = await commitStudentImportApi(preview.valid)
      const parts = [`${t('Imported')} ${result.created} ${t('students')}`]
      if (result.failed.length > 0) parts.push(`${result.failed.length} ${t('failed')}`)
      if (result.feesRecorded > 0) parts.push(`${result.feesRecorded} ${t('fee payments recorded')}`)
      Alert.alert(t('Import complete'), parts.join('\n'), [{ text: 'OK', onPress: () => { handleClose(); onImported() } }])
    } catch (err: any) {
      setImportError(err?.response?.data?.message ?? t('Failed to import students'))
    } finally {
      setCommitting(false)
    }
  }

  const importStyles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    desc: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 19 },
    pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, marginBottom: 16, backgroundColor: colors.bgSecondary },
    pickBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
    fileName: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: -10, marginBottom: 14 },
    error: { backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 12 },
    errorText: { fontSize: 13, color: '#dc2626' },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    resultText: { fontSize: 14, color: colors.text },
    carryOverList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', marginBottom: 12, maxHeight: 160 },
    carryOverItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    carryOverName: { fontSize: 12, color: colors.text, flex: 1, marginRight: 8 },
    matchBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    matchBadgeMatricule: { backgroundColor: '#dcfce7' },
    matchBadgeName: { backgroundColor: '#fef9c3' },
    matchBadgeTextMatricule: { fontSize: 10, fontWeight: '600', color: '#15803d' },
    matchBadgeTextName: { fontSize: 10, fontWeight: '600', color: '#854d0e' },
    errorList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', marginBottom: 12, maxHeight: 120 },
    errorItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    errorItemText: { fontSize: 12, color: colors.textMuted },
    actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    cancelText: { fontSize: 14, fontWeight: '600', color: colors.text },
    commitBtn: { flex: 1, backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    commitBtnDisabled: { opacity: 0.5 },
    commitText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={importStyles.overlay}>
        <View style={importStyles.sheet}>
          <View style={importStyles.header}>
            <Text style={importStyles.title}>{t('Import Students')}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={importStyles.desc}>
              {isUniversity
                ? t('Upload an Excel or CSV roster. For Level 2 classes, include the Matricule column — students whose matricule or name already exist are detected as carry-overs and will not be duplicated.')
                : t('Upload an Excel or CSV roster to add students in one go.')}
            </Text>

            <TouchableOpacity style={importStyles.pickBtn} onPress={handlePickFile} disabled={previewing}>
              <Ionicons name="document-outline" size={18} color={colors.text} />
              <Text style={importStyles.pickBtnText}>{previewing ? t('Reading file...') : t('Choose file (.xlsx or .csv)')}</Text>
            </TouchableOpacity>
            {!!fileName && <Text style={importStyles.fileName}>{fileName}</Text>}

            {!!importError && (
              <View style={importStyles.error}>
                <Text style={importStyles.errorText}>{importError}</Text>
              </View>
            )}

            {preview && !previewing && (
              <>
                {preview.headerError ? (
                  <View style={importStyles.error}>
                    <Text style={importStyles.errorText}>{preview.headerError}</Text>
                  </View>
                ) : (
                  <>
                    <View style={importStyles.resultRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                      <Text style={importStyles.resultText}>{preview.valid.length} {t('students ready to import')}</Text>
                    </View>

                    {preview.carryOvers && preview.carryOvers.length > 0 && (
                      <>
                        <View style={importStyles.resultRow}>
                          <Ionicons name="information-circle" size={18} color="#2563eb" />
                          <Text style={[importStyles.resultText, { color: '#2563eb' }]}>
                            {preview.carryOvers.length} {t('already in system (carry-overs) — will be skipped')}
                          </Text>
                        </View>
                        <ScrollView style={importStyles.carryOverList} nestedScrollEnabled>
                          {preview.carryOvers.map((c: CarryOverRow) => (
                            <View key={c.row} style={importStyles.carryOverItem}>
                              <Text style={importStyles.carryOverName} numberOfLines={1}>{c.name}</Text>
                              <View style={[importStyles.matchBadge, c.matchType === 'matricule' ? importStyles.matchBadgeMatricule : importStyles.matchBadgeName]}>
                                <Text style={c.matchType === 'matricule' ? importStyles.matchBadgeTextMatricule : importStyles.matchBadgeTextName}>
                                  {c.matchType === 'matricule' ? t('Matricule match') : t('Name match')}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    {preview.errors.length > 0 && (
                      <>
                        <View style={importStyles.resultRow}>
                          <Ionicons name="warning" size={18} color="#dc2626" />
                          <Text style={[importStyles.resultText, { color: '#dc2626' }]}>
                            {preview.errors.length} {t('rows have problems and will be skipped')}
                          </Text>
                        </View>
                        <ScrollView style={importStyles.errorList} nestedScrollEnabled>
                          {preview.errors.map((e) => (
                            <View key={e.row} style={importStyles.errorItem}>
                              <Text style={importStyles.errorItemText}>{t('Row')} {e.row}: {e.reason}</Text>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            <View style={importStyles.actions}>
              <TouchableOpacity style={importStyles.cancelBtn} onPress={handleClose}>
                <Text style={importStyles.cancelText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[importStyles.commitBtn, (!preview || preview.valid.length === 0 || committing) && importStyles.commitBtnDisabled]}
                onPress={handleCommit}
                disabled={!preview || preview.valid.length === 0 || committing}
              >
                {committing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={importStyles.commitText}>{t('Import')} {preview?.valid.length ?? 0} {t('students')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export default function StudentsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { user, activeSession, setActiveSession, school } = useAuthStore()
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')
  const isUniversity = school?.type === 'UNIVERSITY'

  const [students, setStudents] = useState<Student[]>([])
  const [classList, setClassList] = useState<ClassLevel[]>([])
  const [liveSession, setLiveSession] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<StudentStatus>('ACTIVE')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [createVisible, setCreateVisible] = useState(false)
  const [feesStudent, setFeesStudent] = useState<Student | null>(null)
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({})
  const [importVisible, setImportVisible] = useState(false)

  const isSuperAdmin = user?.role === 'SUPERADMIN'

  // Disabled/Dismissed is a status filter, not a year filter — it bypasses
  // the year-aware roster entirely (see getStudents in student.controller.ts).
  const fetchStudents = useCallback(async () => {
    try {
      const studentParams = statusFilter === 'ACTIVE'
        ? (activeSession ? { session: activeSession } : undefined)
        : { status: statusFilter }
      const [sData, clData, subData, termData] = await Promise.all([
        getStudents(studentParams),
        isAdmin ? getClasses() : Promise.resolve({ classLevels: [] }),
        isAdmin ? getSubjects() : Promise.resolve({ subjects: [] }),
        isAdmin ? getTerms() : Promise.resolve({ terms: [] }),
      ])
      setStudents(sData.students)
      if (isAdmin) {
        setClassList((clData as { classLevels: ClassLevel[] }).classLevels.sort((a, b) => a.order - b.order))
        const map: Record<string, string[]> = {}
        for (const s of (subData as { subjects: { name: string; classLevel: string }[] }).subjects) {
          (map[s.classLevel] ??= []).push(s.name)
        }
        setSubjectsByClass(map)
        setLiveSession(termData.terms.find((tm) => tm.isCurrent)?.session)
      }
    } catch {
      setError(t('Failed to load students'))
    }
  }, [isAdmin, activeSession, statusFilter])

  // A newly created student only shows up in this list while viewing the LIVE
  // academic year — a past year's roster is scoped to students who already
  // have a report card that session, which a freshly created student never
  // has yet (see student.controller.ts getStudents). Switch the app-wide
  // active year to the live one right after a successful create so the new
  // student is actually visible, instead of silently "disappearing" if a
  // past year happened to be selected.
  const handleStudentCreated = () => {
    if (liveSession && liveSession !== activeSession) setActiveSession(liveSession)
    fetchStudents()
  }

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

  // Replaces the old silent "delete" (which never deleted anything — just set
  // isActive: false with no visible status and no way back). See
  // Student.status in schema.prisma.
  const applyStatus = async (student: Student, status: StudentStatus) => {
    try {
      await setStudentStatus(student.id, status)
      setDetailVisible(false)
      fetchStudents()
    } catch {
      Alert.alert(t('Error'), t('Failed to update status.'))
    }
  }

  const handleChangeStatus = (student: Student) => {
    const buttons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress: () => void }[] = STATUS_TABS.map((status) => ({
      text: t(status === 'ACTIVE' ? 'Active' : status === 'DISABLED' ? 'Disabled' : 'Dismissed'),
      style: status === 'DISMISSED' ? 'destructive' : 'default',
      onPress: () => { applyStatus(student, status) },
    }))
    buttons.push({ text: t('Cancel'), style: 'cancel', onPress: () => {} })
    Alert.alert(t('Change Status'), student.name, buttons)
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
        { label: t('Status'), value: (s) => { const st = effectiveStatus(s); return t(st === 'ACTIVE' ? 'Active' : st === 'DISABLED' ? 'Disabled' : 'Dismissed') } },
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

      {isAdmin && (
        <View style={styles.statusTabsRow}>
          {STATUS_TABS.map((s) => (
            <TouchableOpacity key={s} style={[styles.statusTab, statusFilter === s && styles.statusTabActive]} onPress={() => setStatusFilter(s)}>
              <Text style={[styles.statusTabText, statusFilter === s && styles.statusTabTextActive]}>
                {t(s === 'ACTIVE' ? 'Active' : s === 'DISABLED' ? 'Disabled' : 'Dismissed')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isAdmin && (
        <View style={styles.exportBar}>
          <TouchableOpacity style={styles.exportBtn} onPress={() => setImportVisible(true)}>
            <Ionicons name="cloud-upload-outline" size={15} color="#F03E2F" />
            <Text style={styles.exportText}>{t('Import')}</Text>
          </TouchableOpacity>
          {filtered.length > 0 && (
            <TouchableOpacity style={[styles.exportBtn, { marginLeft: 8 }]} onPress={handleExport}>
              <Ionicons name="download-outline" size={15} color="#F03E2F" />
              <Text style={styles.exportText}>{t('Export CSV')}</Text>
            </TouchableOpacity>
          )}
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
            {(() => {
              const st = effectiveStatus(item)
              const box = st === 'ACTIVE' ? styles.badgeActive : st === 'DISABLED' ? styles.badgeDisabled : styles.badgeInactive
              const txt = st === 'ACTIVE' ? styles.badgeTextActive : st === 'DISABLED' ? styles.badgeTextDisabled : styles.badgeTextInactive
              return (
                <View style={[styles.badge, box]}>
                  <Text style={[styles.badgeText, txt]}>
                    {t(st === 'ACTIVE' ? 'Active' : st === 'DISABLED' ? 'Disabled' : 'Dismissed')}
                  </Text>
                </View>
              )
            })()}
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
        onChangeStatus={handleChangeStatus}
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
        onCreated={handleStudentCreated}
        classList={classList}
      />

      <ImportStudentsModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onImported={handleStudentCreated}
        isUniversity={isUniversity}
      />
    </View>
  )
}
