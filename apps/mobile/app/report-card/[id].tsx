import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getReportCard, getSubjects, saveEntries, publishReportCard,
  getReadinessDetail, ReportCardDetail, Subject, ReadinessDetail,
} from '@/lib/api/reportcards'
import { getGradingScale, gradeFromScore, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { useTheme, Colors } from '@/lib/useTheme'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'

interface Entry { subjectId: string; score: string; grade: string; remarks: string }

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  studentName: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  draftBadge: { backgroundColor: '#fef9c3' },
  publishedBadge: { backgroundColor: '#dcfce7' },
  statusText: { fontSize: 12, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 },
  subjectRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 10,
  },
  subjectName: { fontSize: 14, color: colors.text, fontWeight: '500', marginBottom: 6 },
  subjectRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 6,
    textAlign: 'center',
    fontSize: 14,
    color: colors.text,
  },
  scoreReadOnly: { fontSize: 15, fontWeight: '600', color: colors.text, width: 40 },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  gradeText: { fontSize: 11, fontWeight: '600' },
  remarksInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  remarksReadOnly: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  generalRemarksInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.card,
  },
  saveBtnText: { fontWeight: '600', color: colors.text, fontSize: 15 },
  publishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 14,
  },
  publishBtnText: { fontWeight: '600', color: '#fff', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function ReportCardDetailScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [reportCard, setReportCard] = useState<ReportCardDetail | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [remarks, setRemarks] = useState('')
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [readiness, setReadiness] = useState<ReadinessDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const fetchData = useCallback(async () => {
    const [rc, subjectData, scaleData] = await Promise.all([
      getReportCard(id),
      getSubjects(),
      getGradingScale().catch(() => ({ ranges: DEFAULT_RANGES })),
    ])
    if (scaleData.ranges?.length > 0) setGradingRanges(scaleData.ranges)
    setReportCard(rc)
    setRemarks(rc.remarks || '')
    if (user?.role !== 'CLASS_MASTER') getReadinessDetail(id).then(setReadiness).catch(() => {})
    // A course scoped to one semester (university) only counts for that
    // semester; a subject with no term (primary/secondary) always counts.
    const classSubjects = subjectData.subjects.filter((s) =>
      s.classLevel === rc.student.classLevel
      && (s.term == null || s.term === rc.term.name)
      && (s.compulsory !== false || rc.entries.some((e) => e.subject.id === s.id)))
    setSubjects(classSubjects)
    setEntries(
      classSubjects.map((s) => {
        const e = rc.entries.find((e) => e.subject.id === s.id)
        // Use '' for null/unfilled scores so we can distinguish from explicitly-entered 0
        return { subjectId: s.id, score: e?.score != null ? String(e.score) : '', grade: e?.grade ?? '', remarks: e?.remarks ?? '' }
      })
    )
  }, [id])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const updateScore = (subjectId: string, raw: string) => {
    const subject = subjects.find((s) => s.id === subjectId)
    const maxScore = subject?.maxScore ?? 20
    setEntries((prev) =>
      prev.map((e) => {
        if (e.subjectId !== subjectId) return e
        const score = Math.min(maxScore, Math.max(0, Number(raw) || 0))
        const g = gradeFromScore(score, maxScore, gradingRanges)
        return { ...e, score: raw, grade: g.grade }
      })
    )
  }

  const updateRemarks = (subjectId: string, text: string) => {
    setEntries((prev) => prev.map((e) => (e.subjectId === subjectId ? { ...e, remarks: text } : e)))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveEntries(id, {
        entries: entries.map((e) => {
          const subject = subjects.find((s) => s.id === e.subjectId)
          const score = Number(e.score) || 0
          const g = gradeFromScore(score, subject?.maxScore ?? 20, gradingRanges)
          return { subjectId: e.subjectId, score, grade: g.grade, remarks: e.remarks }
        }),
      })
      Alert.alert(t('Saved'), t('Report card saved successfully.'))
      fetchData()
    } catch {
      Alert.alert(t('Error'), t('Failed to save report card.'))
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = () => {
    Alert.alert(
      t('Publish Report Card'),
      `${t('Publish the report card for')} ${reportCard?.student.name}? ${t('This cannot be undone.')}`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Publish'),
          style: 'default',
          onPress: async () => {
            setPublishing(true)
            try {
              await publishReportCard(id)
              Alert.alert(t('Published'), t('Report card published successfully.'))
              fetchData()
            } catch {
              Alert.alert(t('Error'), t('Failed to publish report card.'))
            } finally {
              setPublishing(false)
            }
          },
        },
      ]
    )
  }

  if (loading || !reportCard) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSecondary }]}>
        <ActivityIndicator size="large" color="#F03E2F" />
      </View>
    )
  }

  const isDraft = reportCard.status === 'DRAFT'
  const isClassMaster = user?.role === 'CLASS_MASTER'

  // Publish readiness — same rules as admin and web
  const allSeqsFilled = entries.length > 0 && entries.every(e => e.score !== '' && e.score != null)
  const hasRemarks = !!reportCard.remarks?.trim()
  // Positions are class-relative — every other active student in this class + term
  // must also be complete (or already published) before this one can publish.
  const classReady = readiness ? readiness.otherStudentsBlocking === 0 : false
  const canPublish = allSeqsFilled && hasRemarks && classReady

  // Class master can only add remarks once ALL sequences are filled
  const canEditRemarks = !isClassMaster || (isDraft && allSeqsFilled)

  const avgMaxScore = subjects[0]?.maxScore ?? 20
  const average = (() => {
    if (!subjects.length) return 0
    let totalWeighted = 0, totalCoeff = 0
    for (const s of subjects) {
      const entry = entries.find((e) => e.subjectId === s.id)
      // Skip unfilled subjects — matches API: `if (e.score == null) continue`
      if (!entry || entry.score === '') continue
      const coeff = s.coefficient ?? 1
      totalWeighted += Number(entry.score) * coeff
      totalCoeff += coeff
    }
    return totalCoeff > 0 ? totalWeighted / totalCoeff : 0
  })()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Student info */}
      <View style={styles.infoCard}>
        <Text style={styles.studentName}>{reportCard.student.name}</Text>
        <Text style={styles.meta}>
          {reportCard.term.name} · {reportCard.term.session} · {reportCard.student.classLevel}
        </Text>
        <View style={[styles.statusBadge, isDraft ? styles.draftBadge : styles.publishedBadge]}>
          <Ionicons
            name={isDraft ? 'create-outline' : 'checkmark-circle-outline'}
            size={13}
            color={isDraft ? '#854d0e' : '#15803d'}
          />
          <Text style={[styles.statusText, { color: isDraft ? '#854d0e' : '#15803d' }]}>
            {isDraft ? t('Draft') : t('Published')}
          </Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        {[
          { label: t('Terms Average'), value: average.toFixed(1) },
          { label: t('Overall Grade'), value: gradeFromScore(average, avgMaxScore, gradingRanges).remark || gradeFromScore(average, avgMaxScore, gradingRanges).grade },
          { label: t('Position'), value: reportCard.position != null ? `${ordinal(reportCard.position)}${reportCard.classSize ? `/${reportCard.classSize}` : ''}` : '—' },
          ...(reportCard.classAverage != null ? [{ label: t('Class Average'), value: reportCard.classAverage.toFixed(1) }] : []),
          ...(reportCard.annualAverage != null ? [{ label: t('Annual Average'), value: reportCard.annualAverage.toFixed(1) }] : []),
          ...(reportCard.annualPosition != null ? [{ label: t('Annual Position'), value: `${ordinal(reportCard.annualPosition)}${reportCard.annualClassSize ? `/${reportCard.annualClassSize}` : ''}` }] : []),
        ].map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{item.value}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Subjects */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('Subject Scores')}</Text>
        {subjects.map((subject) => {
          const entry = entries.find((e) => e.subjectId === subject.id)
          const isFilled = entry?.score !== '' && entry?.score != null
          const score = isFilled ? Number(entry!.score) : 0
          const g = isFilled ? gradeFromScore(score, subject.maxScore, gradingRanges) : null
          return (
            <View key={subject.id} style={styles.subjectRow}>
              <Text style={styles.subjectName}>{subject.name}</Text>
              <View style={styles.subjectRight}>
                {isDraft ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      style={styles.scoreInput}
                      value={entry?.score ?? ''}
                      onChangeText={(v) => updateScore(subject.id, v)}
                      keyboardType="numeric"
                      maxLength={String(subject.maxScore).length + 1}
                    />
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>/{subject.maxScore}</Text>
                  </View>
                ) : (
                  <Text style={styles.scoreReadOnly}>{isFilled ? `${entry!.score}/${subject.maxScore}` : '--'}</Text>
                )}
                {g ? (
                  <View style={[styles.gradePill, { backgroundColor: `${g.color}18` }]}>
                    <Text style={[styles.gradeText, { color: g.color }]}>{g.remark}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>--</Text>
                )}
              </View>
            </View>
          )
        })}
      </View>

      {/* General Remarks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('General Remarks')}</Text>
        {canEditRemarks && isDraft ? (
          <TextInput
            style={styles.generalRemarksInput}
            value={remarks}
            onChangeText={setRemarks}
            placeholder={t('Overall remarks...')}
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        ) : isClassMaster && !allSeqsFilled ? (
          <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 10 }}>
            <Text style={{ fontSize: 12, color: '#d97706', fontWeight: '600' }}>{t('Cannot add remarks yet')}</Text>
            <Text style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>{t('All subject sequences must be filled first.')}</Text>
          </View>
        ) : (
          <Text style={styles.remarksReadOnly}>{reportCard.remarks || '—'}</Text>
        )}
      </View>

      {/* Actions — class master can save marks but not publish */}
      {isDraft && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#374151" size="small" />
              : <><Ionicons name="save-outline" size={16} color="#374151" /><Text style={styles.saveBtnText}>{t('Save Draft')}</Text></>}
          </TouchableOpacity>
          {user?.role !== 'CLASS_MASTER' && (
            <>
              {!canPublish && (
                <View style={{ flexDirection: 'row', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: allSeqsFilled ? '#dcfce7' : '#fee2e2' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: allSeqsFilled ? '#16a34a' : '#ef4444' }}>{allSeqsFilled ? '✓' : '✗'} {t('Sequences')}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: hasRemarks ? '#dcfce7' : '#fee2e2' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: hasRemarks ? '#16a34a' : '#ef4444' }}>{hasRemarks ? '✓' : '✗'} {t('Remarks')}</Text>
                  </View>
                  {readiness && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: classReady ? '#dcfce7' : '#fee2e2' }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: classReady ? '#16a34a' : '#ef4444' }}>{classReady ? '✓' : '✗'} {t('Whole class')}{!classReady ? ` (${readiness.otherStudentsBlocking})` : ''}</Text>
                    </View>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[styles.publishBtn, (!canPublish || publishing) && styles.disabled]}
                onPress={handlePublish}
                disabled={!canPublish || publishing}
                activeOpacity={0.8}
              >
                {publishing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="send-outline" size={16} color="#fff" /><Text style={styles.publishBtnText}>{t('Publish')}</Text></>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </ScrollView>
    </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  )
}
