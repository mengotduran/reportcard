import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getCurrentTerm, getClassOverview, getReportCard, updateRemarks, generateRemarks,
  ClassStudentOverview,
} from '@/lib/api/reportcards'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

interface StudentRow extends ClassStudentOverview {
  remarks: string | null
  remarksFr: string | null
  allSeqsFilled: boolean
}

const makeSStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  infoBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#faf5ff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#ede9fe',
  },
  infoText: { fontSize: 13, fontWeight: '600', color: '#6d28d9' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  pillText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },

  list: { padding: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#7c3aed' },
  rowInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  rowNum: { fontSize: 11, color: colors.textMuted, width: 20 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  avg: { fontSize: 12, fontWeight: '600', color: colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  published: { backgroundColor: '#dcfce7' },
  draft: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 10, fontWeight: '600' },
  noCard: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  remarksPreview: { fontSize: 11, color: '#7c3aed', fontStyle: 'italic' },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  editBtnFilled: { borderColor: '#ddd6fe', backgroundColor: '#faf5ff' },
  editBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  editBtnTextFilled: { color: '#7c3aed' },
  editBtnGranted: { borderColor: '#93c5fd', backgroundColor: '#FEF2F1' },
  lockedBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  lockedBtnText: { fontSize: 14 },
  incompleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  incompleteBtnText: { fontSize: 10, fontWeight: '600', color: '#d97706' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#e5e7eb',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  textarea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 14, fontSize: 14, color: colors.text,
    minHeight: 120, backgroundColor: colors.bgSecondary, marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#7c3aed', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.5 },
}))

export default function ClassMasterScreen() {
  const { colors, isDark } = useTheme()
  const s = makeSStyles(colors)
  const t = useT()
  const { classLevel, termId: paramTermId } = useLocalSearchParams<{ classLevel: string; termId: string }>()
  const { user } = useAuthStore()
  const navigation = useNavigation()
  const decodedClass = decodeURIComponent(classLevel)

  const [termId, setTermId] = useState(paramTermId ?? '')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Remarks modal state
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null)
  const [remarksText, setRemarksText] = useState('')
  const [schoolLang, setSchoolLang] = useState<'EN' | 'FR'>('EN')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    navigation.setOptions({ title: decodedClass })
  }, [decodedClass])

  const fetchData = useCallback(async () => {
    try {
      let tid = termId
      if (!tid) {
        const { term } = await getCurrentTerm()
        tid = term.id
        setTermId(tid)
      }
      const overview = await getClassOverview(tid, decodedClass)
      const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))

      const enriched: StudentRow[] = await Promise.all(
        sorted.map(async (s) => {
          if (!s.reportCard) return { ...s, remarks: null, remarksFr: null, allSeqsFilled: false }
          try {
            const rc = await getReportCard(s.reportCard.id)
            if (rc.school?.language) setSchoolLang(rc.school.language === 'FR' ? 'FR' : 'EN')
            const seqsFilled = rc.entries?.length > 0 &&
              rc.entries.every((e: any) => e.seq1Score != null && e.seq2Score != null)
            return { ...s, remarks: rc.remarks ?? null, remarksFr: rc.remarksFr ?? null, allSeqsFilled: seqsFilled }
          } catch {
            return { ...s, remarks: null, remarksFr: null, allSeqsFilled: false }
          }
        })
      )
      setStudents(enriched)
    } catch {
      Alert.alert(t('Error'), t('Failed to load students.'))
    }
  }, [decodedClass, termId])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const openEdit = (student: StudentRow) => {
    setEditTarget(student)
    setRemarksText((schoolLang === 'FR' ? student.remarksFr : student.remarks) ?? '')
  }

  const handleGenerate = async () => {
    if (!editTarget?.reportCard) return
    if (editTarget.reportCard.average == null) {
      Alert.alert(t('Not ready'), t('The term average has not been computed yet — fill all sequences first.'))
      return
    }
    setGenerating(true)
    try {
      const result = await generateRemarks(editTarget.reportCard.id)
      setRemarksText((schoolLang === 'FR' ? result.remarksFr : result.remarks) ?? '')
      if (!result.aiAvailable) Alert.alert(t('AI unavailable'), t('Inserted a default remark you can edit.'))
    } catch {
      Alert.alert(t('Error'), t('Failed to generate remarks.'))
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!editTarget?.reportCard) return
    setSaving(true)
    try {
      if (schoolLang === 'FR') await updateRemarks(editTarget.reportCard.id, undefined, remarksText)
      else await updateRemarks(editTarget.reportCard.id, remarksText)
      setStudents(prev =>
        prev.map(s => s.id === editTarget.id
          ? { ...s, ...(schoolLang === 'FR' ? { remarksFr: remarksText } : { remarks: remarksText }) }
          : s)
      )
      setEditTarget(null)
    } catch {
      Alert.alert(t('Error'), t('Failed to save remarks.'))
    } finally {
      setSaving(false)
    }
  }

  const activeRemark = (row: StudentRow) => (schoolLang === 'FR' ? row.remarksFr : row.remarks) ?? ''
  const filledCount = students.filter(s => activeRemark(s).trim().length > 0).length

  return (
    <View style={s.container}>
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#7c3aed" /></View>
      ) : (
      <>
      {/* Info bar */}
      <View style={s.infoBar}>
        <Text style={s.infoText}>{decodedClass}</Text>
        <View style={s.pill}>
          <Ionicons name="chatbubble-ellipses-outline" size={12} color="#7c3aed" />
          <Text style={s.pillText}>{filledCount}/{students.length} {t('remarks')}</Text>
        </View>
      </View>

      <FlatList
        data={students}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="people-outline" size={40} color="#d1d5db" />
            <Text style={s.emptyText}>{t('No students found for')} {decodedClass}</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const hasRemarks = activeRemark(item).trim().length > 0
          const isPublished = item.reportCard?.status === 'PUBLISHED'
          const seqsOk = item.allSeqsFilled
          return (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{item.name.charAt(0)}</Text>
                </View>
                <View style={s.rowInfo}>
                  <View style={s.nameRow}>
                    <Text style={s.rowNum}>{index + 1}.</Text>
                    <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={s.metaRow}>
                    {item.reportCard ? (
                      <>
                        <Text style={s.avg}>
                          {item.reportCard.average != null
                            ? `${item.reportCard.average.toFixed(1)}/20`
                            : t('No marks')}
                        </Text>
                        <View style={[s.statusBadge, isPublished ? s.published : s.draft]}>
                          <Text style={[s.statusText, { color: isPublished ? '#15803d' : '#92400e' }]}>
                            {isPublished ? t('Published') : t('Draft')}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text style={s.noCard}>{t('No report card yet')}</Text>
                    )}
                  </View>
                  {hasRemarks && (
                    <Text style={s.remarksPreview} numberOfLines={1}>{activeRemark(item)}</Text>
                  )}
                </View>
              </View>

              {item.reportCard && (
                isPublished && item.reportCard.remarksEditGrantedTo !== user?.id ? (
                  <View style={s.lockedBtn}>
                    <Text style={s.lockedBtnText}>🔒</Text>
                  </View>
                ) : !seqsOk ? (
                  <View style={s.incompleteBtn}>
                    <Ionicons name="warning-outline" size={12} color="#d97706" />
                    <Text style={s.incompleteBtnText}>{t('Marks missing')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.editBtn, hasRemarks && s.editBtnFilled, item.reportCard.remarksEditGrantedTo === user?.id && s.editBtnGranted]}
                    onPress={() => openEdit(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={hasRemarks ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                      size={14}
                      color={item.reportCard.remarksEditGrantedTo === user?.id ? '#F03E2F' : hasRemarks ? '#7c3aed' : '#9ca3af'}
                    />
                    <Text style={[s.editBtnText, hasRemarks && s.editBtnTextFilled, item.reportCard.remarksEditGrantedTo === user?.id && { color: '#F03E2F' }]}>
                      {item.reportCard.remarksEditGrantedTo === user?.id ? t('Edit ✓') : hasRemarks ? t('Edit') : t('Add')}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          )
        }}
      />

      {/* Remarks edit modal */}
      <Modal visible={!!editTarget} animationType="slide" transparent onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />

            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{editTarget?.name}</Text>
                <Text style={s.modalSub}>{t('General Remarks')} · {decodedClass}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {t('Average:')} {editTarget?.reportCard?.average != null ? `${editTarget.reportCard.average.toFixed(1)}/20` : '—'} · {schoolLang === 'FR' ? t('French') : t('English')}
              </Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#faf5ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, opacity: (generating || editTarget?.reportCard?.average == null) ? 0.5 : 1 }}
                onPress={handleGenerate}
                disabled={generating || editTarget?.reportCard?.average == null}
                activeOpacity={0.7}
              >
                {generating
                  ? <ActivityIndicator color="#7c3aed" size="small" />
                  : <Ionicons name="sparkles-outline" size={14} color="#7c3aed" />}
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>{generating ? t('Generating…') : t('Generate with AI')}</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.textarea}
              value={remarksText}
              onChangeText={setRemarksText}
              placeholder={schoolLang === 'FR' ? 'ex. Cet élève a fait de grands progrès ce trimestre. Continue ainsi !' : 'e.g. This student has shown great improvement this term. Encourage them to keep up the good work.'}
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              autoFocus
            />
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>{t('AI drafts are a starting point — review and edit before saving.')}</Text>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditTarget(null)}>
                <Text style={s.cancelBtnText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, saving && s.disabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="checkmark-outline" size={16} color="#fff" />
                      <Text style={s.saveBtnText}>{t('Save Remarks')}</Text>
                    </>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </>
      )}
    </View>
  )
}
