// app/admin/report-card/[id].tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, FlatList, RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getReportCard,
  getSubjects,
  publishReportCard,
  unpublishReportCard,
  grantEditPermission,
  revokeEditPermission,
  getReadinessDetail,
  ReadinessDetail,
  ReportCardDetail,
  Subject,
} from '@/lib/api/reportcards'
import { getTeachers, Teacher } from '@/lib/api/teachers'
import { getGradingScale, gradeFromScore, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { useTheme, Colors } from '@/lib/useTheme'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: '#FEF2F1', borderRadius: 10, marginBottom: 16,
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#F03E2F' },

  // Student info card
  infoCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  studentAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center',
  },
  studentAvatarText: { fontSize: 22, fontWeight: '800', color: '#F03E2F' },
  studentName: { fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
  },
  draftBadge: { backgroundColor: '#fef9c3' },
  publishedBadge: { backgroundColor: '#dcfce7' },
  statusText: { fontSize: 12, fontWeight: '700' },

  // 2×2 stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: {
    width: '47.5%', backgroundColor: colors.card, borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Section card
  section: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: '#F03E2F' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10 },
  publishBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14,
  },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  unpublishBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#fee2e2', borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: '#fecaca',
  },
  unpublishBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },

  // Grant permission
  grantedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grantedInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grantedText: { fontSize: 14, color: '#16a34a', fontWeight: '600' },
  revokeBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fee2e2', borderRadius: 8 },
  revokeBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  grantBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 14,
  },
  grantBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Subject score cards
  scoreCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 0,
  },
  scoreCardInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  scoreLeft: { flex: 1 },
  scoreSubjectName: { fontSize: 14, fontWeight: '700', color: colors.text },
  scoreCoeff: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  scoreRight: { alignItems: 'flex-end', gap: 6 },
  scoreValue: { fontSize: 16, fontWeight: '800' },
  gradeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  gradeText: { fontSize: 11, fontWeight: '700' },
  scoreRemarks: {
    fontSize: 12, color: colors.textSecondary,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
    fontStyle: 'italic',
  },

  // Remarks section
  remarksText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  disabled: { opacity: 0.5 },

  // Readiness / attribution
  readinessBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  readinessOk: { backgroundColor: '#dcfce7' },
  readinessFail: { backgroundColor: '#fee2e2' },
  attributionPanel: {
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  attributionTitle: { fontSize: 10, fontWeight: '700', color: '#d97706', letterSpacing: 0.5, marginBottom: 6 },
  attributionRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 4 },
  attributionText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 18 },

  // Teacher picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '65%',
  },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  teacherItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  teacherAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center',
  },
  teacherAvatarText: { fontSize: 16, fontWeight: '700', color: '#F03E2F' },
  teacherName: { fontSize: 14, fontWeight: '600', color: colors.text },
  teacherRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
}))

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function TeacherPickerModal({
  visible,
  title,
  teachers,
  onSelect,
  onClose,
}: {
  visible: boolean
  title: string
  teachers: Teacher[]
  onSelect: (teacher: Teacher) => void
  onClose: () => void
}) {
  const { colors } = useTheme()
  const c = colors
  const styles = makeStylesStyles(colors)
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={teachers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: c.textSecondary }}>No teachers found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.teacherItem} onPress={() => onSelect(item)}>
                <View style={styles.teacherAvatar}>
                  <Text style={styles.teacherAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teacherName}>{item.name}</Text>
                  <Text style={styles.teacherRole}>{item.role === 'CLASS_MASTER' ? 'Class Master' : 'Class Teacher'}{item.masterClassLevel ? ` · ${item.masterClassLevel}` : ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  )
}

export default function AdminReportCardDetail() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [reportCard, setReportCard] = useState<ReportCardDetail | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [readiness, setReadiness] = useState<ReadinessDetail | null>(null)
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [grantingMarks, setGrantingMarks] = useState(false)
  const [grantingRemarks, setGrantingRemarks] = useState(false)
  const [revokingMarks, setRevokingMarks] = useState(false)
  const [revokingRemarks, setRevokingRemarks] = useState(false)
  const [marksPickerVisible, setMarksPickerVisible] = useState(false)
  const [remarksPickerVisible, setRemarksPickerVisible] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [rc, teacherData, scaleData, subjectData] = await Promise.all([
        getReportCard(id),
        getTeachers(),
        getGradingScale().catch(() => ({ ranges: DEFAULT_RANGES })),
        getSubjects(),
      ])
      setReportCard(rc)
      setTeachers(teacherData.teachers)
      if (scaleData.ranges?.length > 0) setGradingRanges(scaleData.ranges)
      // Show ALL class subjects, not just those with entries
      const classSubjects = subjectData.subjects.filter((s) => s.classLevel === rc.student.classLevel)
      setSubjects(classSubjects)
      // Fetch attribution (which teacher / class master is blocking)
      getReadinessDetail(id).then(setReadiness).catch(() => {})
    } catch {
      Alert.alert('Error', 'Failed to load report card.')
    }
  }, [id])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const handlePublish = () => {
    Alert.alert(
      'Publish Report Card',
      `Publish ${reportCard?.student.name}'s report card?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true)
            try {
              await publishReportCard(id)
              await fetchData()
              Alert.alert('Success', 'Report card published.')
            } catch {
              Alert.alert('Error', 'Failed to publish.')
            } finally {
              setPublishing(false)
            }
          },
        },
      ]
    )
  }

  const handleUnpublish = () => {
    Alert.alert(
      'Unpublish Report Card',
      `Unpublish ${reportCard?.student.name}'s report card and set back to draft?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpublish',
          style: 'destructive',
          onPress: async () => {
            setUnpublishing(true)
            try {
              await unpublishReportCard(id)
              await fetchData()
              Alert.alert('Success', 'Report card unpublished.')
            } catch {
              Alert.alert('Error', 'Failed to unpublish.')
            } finally {
              setUnpublishing(false)
            }
          },
        },
      ]
    )
  }

  const handleGrantMarks = async (teacher: Teacher) => {
    setMarksPickerVisible(false)
    setGrantingMarks(true)
    try {
      await grantEditPermission(id, 'marks', teacher.id)
      await fetchData()
      Alert.alert('Done', `Marks permission granted to ${teacher.name}.`)
    } catch {
      Alert.alert('Error', 'Failed to grant marks permission.')
    } finally {
      setGrantingMarks(false)
    }
  }

  const handleGrantRemarks = async (teacher: Teacher) => {
    setRemarksPickerVisible(false)
    setGrantingRemarks(true)
    try {
      await grantEditPermission(id, 'remarks', teacher.id)
      await fetchData()
      Alert.alert('Done', `Remarks permission granted to ${teacher.name}.`)
    } catch {
      Alert.alert('Error', 'Failed to grant remarks permission.')
    } finally {
      setGrantingRemarks(false)
    }
  }

  const handleRevokeMarks = () => {
    Alert.alert('Revoke Marks Permission', 'Remove marks edit access?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setRevokingMarks(true)
          try {
            await revokeEditPermission(id, 'marks')
            await fetchData()
          } catch {
            Alert.alert('Error', 'Failed to revoke permission.')
          } finally {
            setRevokingMarks(false)
          }
        },
      },
    ])
  }

  const handleRevokeRemarks = () => {
    Alert.alert('Revoke Remarks Permission', 'Remove remarks edit access?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setRevokingRemarks(true)
          try {
            await revokeEditPermission(id, 'remarks')
            await fetchData()
          } catch {
            Alert.alert('Error', 'Failed to revoke permission.')
          } finally {
            setRevokingRemarks(false)
          }
        },
      },
    ])
  }

  if (loading || !reportCard) {
    return <View style={[styles.center, { backgroundColor: colors.bgSecondary }]}><ActivityIndicator size="large" color="#F03E2F" /></View>
  }

  const isDraft = reportCard.status === 'DRAFT'
  const average = reportCard.average ?? 0
  const avgMaxScore = subjects[0]?.maxScore ?? 20
  const gradeResult = gradeFromScore(average, avgMaxScore, gradingRanges)

  // Publish readiness (same rules as web + bulk-publish)
  const allSeqsFilled = reportCard.entries.length > 0 &&
    reportCard.entries.every(e => (e as any).seq1Score != null && (e as any).seq2Score != null)
  const hasRemarks = !!reportCard.remarks?.trim()
  const canPublish = allSeqsFilled && hasRemarks

  const marksGrantedTo = (reportCard as any).marksEditGrantedTo
  const remarksGrantedTo = (reportCard as any).remarksEditGrantedTo
  const marksTeacher = teachers.find((t) => t.id === marksGrantedTo)
  const remarksTeacher = teachers.find((t) => t.id === remarksGrantedTo)

  const classMasters = teachers.filter((t) => t.role === 'CLASS_MASTER')
  const classTeachers = teachers.filter((t) => t.role === 'CLASS_TEACHER')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color="#F03E2F" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.studentAvatar}>
            <Text style={styles.studentAvatarText}>{reportCard.student.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{reportCard.student.name}</Text>
            <Text style={styles.meta}>{reportCard.student.classLevel} · {reportCard.term.name} · {reportCard.term.session}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, isDraft ? styles.draftBadge : styles.publishedBadge]}>
          <Ionicons name={isDraft ? 'create-outline' : 'checkmark-circle-outline'} size={13} color={isDraft ? '#854d0e' : '#15803d'} />
          <Text style={[styles.statusText, { color: isDraft ? '#854d0e' : '#15803d' }]}>
            {isDraft ? 'Draft' : 'Published'}
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {[
          { label: 'Subjects', value: String(subjects.length || reportCard.entries.length) },
          { label: 'Terms Average', value: average.toFixed(1) },
          { label: 'Overall Grade', value: gradeResult.remark || gradeResult.grade },
          { label: 'Position', value: reportCard.position != null ? ordinal(reportCard.position) : '—' },
        ].map((item) => (
          <View key={item.label} style={styles.statCard}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Actions</Text>
        </View>
        {/* Readiness badges */}
        {isDraft && !canPublish && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <View style={[styles.readinessBadge, allSeqsFilled ? styles.readinessOk : styles.readinessFail]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: allSeqsFilled ? '#16a34a' : '#ef4444' }}>
                {allSeqsFilled ? '✓' : '✗'} Sequences
              </Text>
            </View>
            <View style={[styles.readinessBadge, hasRemarks ? styles.readinessOk : styles.readinessFail]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: hasRemarks ? '#16a34a' : '#ef4444' }}>
                {hasRemarks ? '✓' : '✗'} Remarks
              </Text>
            </View>
          </View>
        )}
        {/* Action Required attribution panel */}
        {isDraft && readiness && (readiness.missingSubjects.length > 0 || readiness.missingRemarks) && (
          <View style={styles.attributionPanel}>
            <Text style={styles.attributionTitle}>ACTION REQUIRED</Text>
            {readiness.missingSubjects.map(s => (
              <View key={s.subjectId} style={styles.attributionRow}>
                <Ionicons name="ellipse" size={6} color="#ef4444" style={{ marginTop: 4 }} />
                <Text style={styles.attributionText}>
                  {s.teacher
                    ? <Text><Text style={{ fontWeight: '700' }}>{s.teacher.name}</Text> has not filled <Text style={{ fontWeight: '700' }}>{s.subjectName}</Text></Text>
                    : <Text><Text style={{ fontWeight: '700' }}>{s.subjectName}</Text> has no teacher assigned</Text>
                  }
                </Text>
              </View>
            ))}
            {readiness.missingRemarks && (
              <View style={styles.attributionRow}>
                <Ionicons name="ellipse" size={6} color="#f59e0b" style={{ marginTop: 4 }} />
                <Text style={styles.attributionText}>
                  Class Master <Text style={{ fontWeight: '700' }}>{readiness.missingRemarks.name}</Text> has not written general remarks
                </Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.actionRow}>
          {isDraft ? (
            <TouchableOpacity
              style={[styles.publishBtn, (!canPublish || publishing) && styles.disabled]}
              onPress={handlePublish}
              disabled={!canPublish || publishing}
            >
              {publishing ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="send-outline" size={16} color="#fff" />
                  <Text style={styles.publishBtnText}>Publish</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.unpublishBtn, unpublishing && styles.disabled]}
              onPress={handleUnpublish}
              disabled={unpublishing}
            >
              {unpublishing ? <ActivityIndicator color="#ef4444" size="small" /> : (
                <>
                  <Ionicons name="arrow-undo-outline" size={16} color="#ef4444" />
                  <Text style={styles.unpublishBtnText}>Unpublish</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Grant permissions — only visible after publishing */}
      {!isDraft && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Marks Permission</Text>
            </View>
            <Text style={styles.sectionSub}>Grant a teacher edit access to marks</Text>
            {marksGrantedTo ? (
              <View style={styles.grantedRow}>
                <View style={styles.grantedInfo}>
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text style={styles.grantedText}>Granted to {marksTeacher?.name ?? 'Unknown'}</Text>
                </View>
                <TouchableOpacity style={styles.revokeBtn} onPress={handleRevokeMarks} disabled={revokingMarks}>
                  {revokingMarks ? <ActivityIndicator size="small" color="#ef4444" /> : <Text style={styles.revokeBtnText}>Revoke</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.grantBtn, grantingMarks && styles.disabled]}
                onPress={() => setMarksPickerVisible(true)}
                disabled={grantingMarks}
              >
                {grantingMarks ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="person-add-outline" size={16} color="#fff" />
                    <Text style={styles.grantBtnText}>Grant Marks Access</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Remarks Permission</Text>
            </View>
            <Text style={styles.sectionSub}>Grant a class master edit access to remarks</Text>
            {remarksGrantedTo ? (
              <View style={styles.grantedRow}>
                <View style={styles.grantedInfo}>
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text style={styles.grantedText}>Granted to {remarksTeacher?.name ?? 'Unknown'}</Text>
                </View>
                <TouchableOpacity style={styles.revokeBtn} onPress={handleRevokeRemarks} disabled={revokingRemarks}>
                  {revokingRemarks ? <ActivityIndicator size="small" color="#ef4444" /> : <Text style={styles.revokeBtnText}>Revoke</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.grantBtn, grantingRemarks && styles.disabled]}
                onPress={() => setRemarksPickerVisible(true)}
                disabled={grantingRemarks}
              >
                {grantingRemarks ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                    <Text style={styles.grantBtnText}>Grant Remarks Access</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Subject Scores</Text>
        </View>
        {subjects.length === 0 ? (
          <Text style={styles.emptyText}>No subjects found for this class</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {subjects.map((subject) => {
              const entry = reportCard.entries.find((e) => e.subject.id === subject.id)
              const unfilled = !entry || (entry.seq1Score == null || entry.seq2Score == null)
              const maxScore = subject.maxScore ?? 20
              const coeff = subject.coefficient ?? 1
              const gr = unfilled ? null : gradeFromScore(entry!.score ?? 0, maxScore, gradingRanges)
              return (
                <View key={subject.id} style={[styles.scoreCard, gr && { borderLeftWidth: 3, borderLeftColor: gr.color }]}>
                  <View style={styles.scoreCardInner}>
                    <View style={styles.scoreLeft}>
                      <Text style={styles.scoreSubjectName}>{subject.name}</Text>
                      <Text style={styles.scoreCoeff}>Coeff ×{coeff} · max {maxScore}</Text>
                    </View>
                    <View style={styles.scoreRight}>
                      <Text style={[styles.scoreValue, { color: unfilled ? colors.textMuted : colors.text }]}>
                        {unfilled ? '—' : `${entry!.score ?? 0}/${maxScore}`}
                      </Text>
                      {gr ? (
                        <View style={[styles.gradeBadge, { backgroundColor: gr.bgColor ?? '#f3f4f6' }]}>
                          <Text style={[styles.gradeText, { color: gr.color }]}>{gr.remark || gr.grade}</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>Not filled</Text>
                      )}
                    </View>
                  </View>
                  {entry?.remarks ? (
                    <Text style={styles.scoreRemarks}>"{entry.remarks}"</Text>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>General Remarks</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Set by class master</Text>
        <Text style={styles.remarksText}>{reportCard.remarks || '—'}</Text>
      </View>

      <TeacherPickerModal
        visible={marksPickerVisible}
        title="Select Teacher for Marks"
        teachers={classTeachers.length > 0 ? classTeachers : teachers}
        onSelect={handleGrantMarks}
        onClose={() => setMarksPickerVisible(false)}
      />

      <TeacherPickerModal
        visible={remarksPickerVisible}
        title="Select Class Master for Remarks"
        teachers={classMasters.length > 0 ? classMasters : teachers}
        onSelect={handleGrantRemarks}
        onClose={() => setRemarksPickerVisible(false)}
      />
    </ScrollView>
  )
}
