// app/admin/classes/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Alert, Modal,
  TextInput, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getClasses, createClass, deleteClass, ClassLevel } from '@/lib/api/classes'
import { getDepartments, createDepartment, deleteDepartment, Department } from '@/lib/api/departments'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'
import { formatXAF } from '@/lib/api/fees'

const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()
const DEPT_SUGGESTIONS = ['Grammar', 'Technical', 'Commercial']
const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

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
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 20, fontWeight: '800', color: '#F03E2F' },
  info: { flex: 1 },
  className: { fontSize: 15, fontWeight: '700', color: colors.text },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  streamBadge: { backgroundColor: '#FEE2E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  streamBadgeText: { fontSize: 11, fontWeight: '600', color: '#F03E2F' },
  orderBadge: { backgroundColor: colors.bgSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  orderBadgeText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  feeBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  feeBadgeText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
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
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: '#F03E2F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  deptBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8, flexDirection: 'row' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  chipCount: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  chipCountActive: { color: '#fff' },
  addChip: { borderStyle: 'dashed', borderColor: '#F03E2F', backgroundColor: 'transparent' },
  addChipText: { color: '#F03E2F', fontWeight: '600', fontSize: 13 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  suggestChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  suggestChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 6 },
  sectionBtn: {
    width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionBtnActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  sectionBtnText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  sectionBtnTextActive: { color: '#fff' },
}))

export default function ClassesScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  // Universities call classes "departments" — same data/route, just different wording.
  const tt = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [classes, setClasses] = useState<ClassLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [hasStream, setHasStream] = useState(false)
  const [maxScore, setMaxScore] = useState('20')
  const [feeAmount, setFeeAmount] = useState('150000')
  const [creating, setCreating] = useState(false)

  // Secondary departments (streams)
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState<string>('')
  const [deptModalVisible, setDeptModalVisible] = useState(false)
  const [deptName, setDeptName] = useState('')
  const [savingDept, setSavingDept] = useState(false)
  const activeDept = departments.find((d) => d.id === activeDeptId)

  // Secondary class sections (A/B/C…) — optional. A school with one stream per class
  // leaves none selected and gets a single bare class ("Form 1"). Only a school that
  // actually splits a class into streams picks letters, one class per letter.
  const [sections, setSections] = useState<string[]>([])

  // Non-default departments store their classes with a " (Department)" suffix so the
  // globally-unique class name can repeat the same form across departments (Grammar
  // Form 1 vs Technical Form 1). Mirrors apps/web/.../classes/page.tsx.
  const composeClassName = (base: string): string => {
    if (!isSecondary || !activeDept || activeDept.isDefault) return base
    return `${base} (${activeDept.name})`
  }

  const fetchClasses = useCallback(async () => {
    try {
      const data = await getClasses()
      setClasses(data.classLevels.sort((a, b) => a.order - b.order))
    } catch {
      Alert.alert(t('Error'), tt('Failed to load classes.', 'Failed to load departments.'))
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    try {
      const d = await getDepartments()
      setDepartments(d.departments)
      setActiveDeptId((prev) =>
        prev && d.departments.some((x) => x.id === prev)
          ? prev
          : (d.departments.find((x) => x.isDefault)?.id ?? d.departments[0]?.id ?? ''))
    } catch { /* ignore */ }
  }, [])

  useFocusEffect(useCallback(() => {
    Promise.all([fetchClasses(), isSecondary ? fetchDepartments() : Promise.resolve()])
      .finally(() => setLoading(false))
  }, [fetchClasses, fetchDepartments, isSecondary]))

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchClasses(), isSecondary ? fetchDepartments() : Promise.resolve()])
    setRefreshing(false)
  }

  const visibleClasses = isSecondary && activeDeptId
    ? classes.filter((c) => c.departmentId === activeDeptId)
    : classes

  const handleCreateDept = async () => {
    if (!deptName.trim()) return
    setSavingDept(true)
    try {
      const { department } = await createDepartment(deptName.trim())
      setDeptModalVisible(false)
      setDeptName('')
      setActiveDeptId(department.id)
      await fetchDepartments()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? t('Failed to save department'))
    } finally { setSavingDept(false) }
  }

  const handleDeleteDept = (dep: Department) => {
    Alert.alert(t('Delete Department'), `${t('Delete')} "${dep.name}"?`, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: async () => {
        try {
          await deleteDepartment(dep.id)
          if (activeDeptId === dep.id) setActiveDeptId('')
          await fetchDepartments()
        } catch (err: any) {
          Alert.alert(t('Error'), err?.response?.data?.message ?? t('Failed to delete department'))
        }
      } },
    ])
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    if (feeAmount.trim() === '' || isNaN(Number(feeAmount)) || Number(feeAmount) < 0) {
      Alert.alert(t('Validation'), tt('Enter the class fee (use 0 if there is none).', 'Enter the department fee (use 0 if there is none).'))
      return
    }
    // No section letters selected → one bare class, e.g. "Form 1". A school with
    // enough students to split a class picks letters instead, one class per letter.
    const secBase = stripDeptSuffix(newName.trim())
    const finalNames = isSecondary
      ? (sections.length ? sections.map((l) => composeClassName(`${secBase} ${l}`)) : [composeClassName(secBase)])
      : [newName.trim()]
    // Skip any sections that already exist so a duplicate doesn't abort the batch.
    const existingNames = new Set(classes.map((c) => c.name))
    const toCreate = finalNames.filter((n) => !existingNames.has(n))
    if (toCreate.length === 0) {
      Alert.alert(t('Error'), t('Those classes already exist.'))
      return
    }
    setCreating(true)
    try {
      for (const name of toCreate) {
        await createClass({
          name, hasStream, maxScore: Number(maxScore) || 20, feeAmount: Number(feeAmount) || 0,
          ...(isSecondary && activeDeptId ? { departmentId: activeDeptId } : {}),
        })
      }
      setModalVisible(false)
      setNewName('')
      setHasStream(false)
      setMaxScore('20')
      setFeeAmount('150000')
      setSections([])
      await fetchClasses()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? tt('Failed to create class.', 'Failed to create department.'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (cls: ClassLevel) => {
    Alert.alert(
      tt('Delete Class', 'Delete Department'),
      `${t('Delete')} "${cls.name}"? ${t('This may affect students and report cards.')}`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(cls.id)
              setClasses((prev) => prev.filter((c) => c.id !== cls.id))
            } catch {
              Alert.alert(t('Error'), tt('Failed to delete class.', 'Failed to delete department.'))
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
        data={visibleClasses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={isSecondary ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deptBar}>
            {departments.map((d) => {
              const count = classes.filter((c) => c.departmentId === d.id).length
              const active = activeDeptId === d.id
              return (
                <TouchableOpacity key={d.id} style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setActiveDeptId(d.id)}
                  onLongPress={() => !d.isDefault && handleDeleteDept(d)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.name}</Text>
                  <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={[styles.chip, styles.addChip]} onPress={() => { setDeptName(''); setDeptModalVisible(true) }}>
              <Ionicons name="add" size={14} color="#F03E2F" />
              <Text style={styles.addChipText}>{t('Add Department')}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{tt('No class levels yet', 'No departments yet')}</Text>
            <Text style={styles.emptySubText}>{tt('Tap + to add a class', 'Tap + to add a department')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>{stripDeptSuffix(item.name).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.className}>{isSecondary ? stripDeptSuffix(item.name) : item.name}</Text>
              <View style={styles.badgeRow}>
                {item.hasStream && (
                  <View style={styles.streamBadge}>
                    <Text style={styles.streamBadgeText}>{t('Has Stream')}</Text>
                  </View>
                )}
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{t('Order:')} {item.order}</Text>
                </View>
                {!!item.feeAmount && item.feeAmount > 0 && (
                  <View style={styles.feeBadge}>
                    <Text style={styles.feeBadgeText}>{formatXAF(item.feeAmount)}</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('Add Class Level', 'Add Department')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{tt('Class Name', 'Department Name')} <Text style={styles.required}>*</Text>
              {isSecondary && <Text style={styles.switchHint}> ({t('without section')})</Text>}
            </Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder={isUniversity ? t('e.g. HND Computer Science - Level 1') : t('e.g. Form 1, Grade 7')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            {isSecondary && (
              <View style={{ marginTop: -10, marginBottom: 16 }}>
                <Text style={styles.label}>{t('Sections')} <Text style={styles.switchHint}>({t('optional')})</Text></Text>
                <View style={styles.sectionRow}>
                  {SECTION_LETTERS.map((l) => {
                    const on = sections.includes(l)
                    return (
                      <TouchableOpacity key={l}
                        onPress={() => setSections((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l].sort())}
                        style={[styles.sectionBtn, on && styles.sectionBtnActive]}>
                        <Text style={[styles.sectionBtnText, on && styles.sectionBtnTextActive]}>{l}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <Text style={styles.switchHint}>
                  {newName.trim()
                    ? `${t('Creates')}: ${(sections.length ? sections.map((l) => `${stripDeptSuffix(newName)} ${l}`) : [stripDeptSuffix(newName)]).join(', ')}`
                    : t('Only pick letters if this class is split into streams — most classes need none.')}
                </Text>
              </View>
            )}

            <Text style={styles.label}>{isUniversity ? t('Max Score per Course') : t('Max Score per Subject')} <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={maxScore}
              onChangeText={setMaxScore}
              placeholder="20"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <Text style={styles.label}>{t('School Fee (XAF)')} <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={feeAmount}
              onChangeText={setFeeAmount}
              placeholder="150000"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>{t('Has Stream')}</Text>
                <Text style={styles.switchHint}>{t('e.g. Form 3A, 3B, 3C')}</Text>
              </View>
              <Switch
                value={hasStream}
                onValueChange={setHasStream}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={hasStream ? '#F03E2F' : '#9ca3af'}
              />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, (!newName.trim() || creating) && styles.disabled]}
              onPress={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{tt('Create Class', 'Create Department')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add department */}
      <Modal visible={deptModalVisible} transparent animationType="slide" onRequestClose={() => setDeptModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Add Department')}</Text>
              <TouchableOpacity onPress={() => setDeptModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('Department Name')} <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={deptName}
              onChangeText={setDeptName}
              placeholder={t('e.g. Technical, Commercial')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.suggestRow}>
              {DEPT_SUGGESTIONS.filter((s) => !departments.some((d) => d.name.toLowerCase() === s.toLowerCase())).map((s) => (
                <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => setDeptName(s)}>
                  <Text style={styles.suggestChipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.createBtn, (!deptName.trim() || savingDept) && styles.disabled]}
              onPress={handleCreateDept}
              disabled={!deptName.trim() || savingDept}
            >
              {savingDept
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{t('Add Department')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
