import { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback,
} from 'react-native'
import { stripProgrammeSuffix } from '@/lib/programme'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getReportCard, getSubjects, saveEntries, publishReportCard,
  getReadinessDetail, ReportCardDetail, Subject, ReadinessDetail,
} from '@/lib/api/reportcards'
import { getGradingScale, gradeFromScore, gradePointForScore20, classificationForGpa, GradeRange, ClassificationBand, DEFAULT_RANGES, DEFAULT_CLASSIFICATION_BANDS } from '@/lib/api/gradingScale'
import { useTheme, Colors } from '@/lib/useTheme'
import { onRealtimeDebounced } from '@/lib/socket'
import {
  CompetencyLevel, DEFAULT_COMPETENCY_LEVELS, findLevel, levelLabel,
} from '@/lib/competency'
import { getCompetencyScaleApi } from '@/lib/api/competencyScale'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'

interface Entry { subjectId: string; score: string; grade: string; remarks: string }

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Amber: this reports a conflict, so it must read as "something happened" at a glance.
  staleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef3c7', borderColor: '#fde68a', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  staleBarText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400e' },
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
  // The school's rating levels, for a COMPETENCY card. Built-ins until the fetch lands.
  const [levels, setLevels] = useState<CompetencyLevel[]>(DEFAULT_COMPETENCY_LEVELS)
  useEffect(() => { getCompetencyScaleApi().then(sc => setLevels(sc.levels)) }, [])
  const [reportCard, setReportCard] = useState<ReportCardDetail | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  // Scores exactly as last loaded, keyed by subject. `entries` is the EDIT BUFFER, so this
  // is the only way to tell a typed-but-unsaved card from a clean one.
  const loadedScoresRef = useRef<Record<string, string>>({})
  // Someone else saved marks for this student while this card held unsaved edits.
  const [staleFromElsewhere, setStaleFromElsewhere] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [classificationBands, setClassificationBands] = useState<ClassificationBand[]>(DEFAULT_CLASSIFICATION_BANDS)
  const [readiness, setReadiness] = useState<ReadinessDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const fetchData = useCallback(async () => {
    const [rc, subjectData, scaleData] = await Promise.all([
      getReportCard(id),
      getSubjects(),
      getGradingScale().catch(() => ({ ranges: DEFAULT_RANGES, classificationBands: DEFAULT_CLASSIFICATION_BANDS })),
    ])
    if (scaleData.ranges?.length > 0) setGradingRanges(scaleData.ranges)
    if (scaleData.classificationBands?.length > 0) setClassificationBands(scaleData.classificationBands)
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
    const loadedEntries = classSubjects.map((s) => {
      const e = rc.entries.find((e) => e.subject.id === s.id)
      // Use '' for null/unfilled scores so we can distinguish from explicitly-entered 0
      return { subjectId: s.id, score: e?.score != null ? String(e.score) : '', grade: e?.grade ?? '', remarks: e?.remarks ?? '' }
    })
    setEntries(loadedEntries)
    // Baseline for "does this card hold unsaved edits" — see isDirty below. `entries` is the
    // edit buffer, so this is the only way to tell typed-but-unsaved from clean.
    loadedScoresRef.current = Object.fromEntries(loadedEntries.map((e) => [e.subjectId, e.score]))
    setStaleFromElsewhere(false)
  }, [id])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  // Unsaved edits present? Compared against the last load rather than tracked by a flag, so
  // typing a mark and then undoing it correctly reads as clean again.
  const isDirty = entries.some((e) => (loadedScoresRef.current[e.subjectId] ?? '') !== e.score)
  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  // Someone else saved marks for this student. Same rule as the marks grid: this screen has
  // an edit buffer, so it is offered a reload rather than having one forced on it. A silent
  // refetch here would wipe scores typed into the very card being edited.
  useEffect(() => onRealtimeDebounced('marks:changed', () => {
    if (isDirtyRef.current) setStaleFromElsewhere(true)
    else fetchData().catch(() => {})
  }), [fetchData])

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
  const isUniversity = reportCard.school?.type === 'UNIVERSITY'
  // Nursery: a rating per subject and nothing else. Read from the CLASS, not the school —
  // one primary school runs both modes at once. Ratings are recorded on the class sheet,
  // never typed here, so this card stays read-only for them.
  const isCompetency = reportCard.gradingMode === 'COMPETENCY'
  // Counts any rating the school HAS ever used, not only its current levels: a pupil rated
  // before the scale was edited is still rated.
  const ratedCount = entries.filter((e) => findLevel(levels, e.grade) !== null).length

  // Publish readiness — same rules as admin and web. Prefer the backend's
  // readiness detail once loaded, since it also catches subjects with zero
  // entries at all, not just entries with a missing sequence score.
  // A competency card has no sequences at all, so "complete" there means every subject
  // carries a rating — the same rule the API's own publish gate applies.
  const localSeqsFilled = entries.length > 0 && (reportCard.gradingMode === 'COMPETENCY'
    ? entries.every(e => findLevel(levels, e.grade) !== null)
    : entries.every(e => e.score !== '' && e.score != null))
  const allSeqsFilled = readiness ? readiness.allSeqsFilled : localSeqsFilled
  const hasRemarks = !!reportCard.remarks?.trim()
  // Positions are class-relative — every other active student in this class + term
  // must also be complete (or already published) before this one can publish.
  const classReady = readiness ? readiness.otherStudentsBlocking === 0 : false
  const canPublish = allSeqsFilled && hasRemarks && classReady

  // Class master can only add remarks once ALL sequences are filled
  const canEditRemarks = !isClassMaster || (isDraft && allSeqsFilled)

  // The scale the AVERAGE is on, which is not always the scale its SUBJECTS are on — only
  // a university states a raw average; primary and secondary both state it out of 20.
  const avgMaxScore = isUniversity ? (subjects[0]?.maxScore ?? 100) : 20
  // Recomputed live as marks are typed, so it must match the API's saveEntries exactly or
  // the figure jumps the moment it's saved: coefficient-weighted, and normalised per
  // subject onto /20 for primary/secondary. Primary marks its subjects raw out of 100 but
  // states the average out of 20, so skipping the normalisation showed 69.4 where the
  // saved card says 13.9.
  const average = (() => {
    if (!subjects.length) return 0
    let totalWeighted = 0, totalCoeff = 0
    for (const s of subjects) {
      const entry = entries.find((e) => e.subjectId === s.id)
      // Skip unfilled subjects — matches API: `if (e.score == null) continue`
      if (!entry || entry.score === '') continue
      const coeff = s.coefficient ?? 1
      const raw = Number(entry.score)
      const max = s.maxScore ?? 0
      totalWeighted += (isUniversity ? raw : (max > 0 ? (raw / max) * 20 : 0)) * coeff
      totalCoeff += coeff
    }
    return totalCoeff > 0 ? totalWeighted / totalCoeff : 0
  })()

  // University only. Semester GPA: Σ(gradePoint × credit) / Σ(credit) — mirrors web +
  // PrintableReportCard logic. "Terms Average"/"Overall Grade"/"Position"/"Class Average"
  // are primary/secondary concepts (a /20 score average and a class rank) and don't
  // apply to a university report card, which is graded and classified by GPA instead.
  const semGpaInfo = (() => {
    let pts = 0, cr = 0
    for (const s of subjects) {
      const entry = entries.find((e) => e.subjectId === s.id)
      if (!entry || entry.score === '') continue
      const gp = gradePointForScore20(Number(entry.score), gradingRanges)
      if (gp == null) continue
      const c = (s as any).credit ?? 0
      pts += gp * c; cr += c
    }
    return { gpa: cr > 0 ? pts / cr : 0, credits: cr }
  })()
  // Null on any semester that does not close the academic year (the API only sends it
  // on the last one). Not defaulted to the semester GPA, which is a different figure.
  const cgpa: number | null = reportCard.cgpa ?? null
  // Classification bands the cumulative once the year has one, otherwise this
  // semester's own GPA, so it always describes a figure shown on this card.
  const classification = classificationForGpa(cgpa ?? semGpaInfo.gpa, classificationBands)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Someone else saved marks for this student while this card holds unsaved edits.
          Offered, never applied automatically: reloading replaces the edit buffer, so
          discarding typed marks has to be the user's decision. */}
      {staleFromElsewhere && (
        <TouchableOpacity
          style={styles.staleBar}
          activeOpacity={0.7}
          onPress={() => { setLoading(true); fetchData().catch(() => {}).finally(() => setLoading(false)) }}
        >
          <Ionicons name="refresh-outline" size={15} color="#92400e" />
          <Text style={styles.staleBarText}>
            {t('Someone else saved marks for this student. Tap to reload, or finish and save yours first.')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Student info */}
      <View style={styles.infoCard}>
        <Text style={styles.studentName}>{reportCard.student.name}</Text>
        <Text style={styles.meta}>
          {reportCard.term.name} · {reportCard.term.session} · {stripProgrammeSuffix(reportCard.student.classLevel)}
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

      {/* Summary. A rated card gets progress instead of figures: it has no average, no
          grade and no position, and printing dashes where they would be reads as data
          that failed to load rather than a deliberate absence. */}
      <View style={styles.summaryRow}>
        {(isCompetency
          ? [
              { label: t('Subjects'), value: String(subjects.length) },
              { label: t('rated'), value: `${ratedCount}/${subjects.length}` },
            ]
          : isUniversity
          ? [
              { label: t('Semester GPA'), value: semGpaInfo.gpa.toFixed(2) },
              // CGPA is the year-end figure, so only the closing semester carries it.
              // Never fall back to the semester GPA under a cumulative label.
              ...(cgpa != null ? [{ label: t('Cumulative GPA'), value: cgpa.toFixed(2) }] : []),
              { label: t('Classification'), value: classification, color: classification === 'Fail' ? '#dc2626' : undefined },
            ]
          : [
              { label: t('Terms Average'), value: average.toFixed(1) },
              { label: t('Overall Grade'), value: gradeFromScore(average, avgMaxScore, gradingRanges).remark || gradeFromScore(average, avgMaxScore, gradingRanges).grade },
              { label: t('Position'), value: reportCard.position != null ? `${ordinal(reportCard.position)}${reportCard.classSize ? `/${reportCard.classSize}` : ''}` : '—' },
              ...(reportCard.classAverage != null ? [{ label: t('Class Average'), value: reportCard.classAverage.toFixed(1) }] : []),
              ...(reportCard.annualAverage != null ? [{ label: t('Annual Average'), value: reportCard.annualAverage.toFixed(1) }] : []),
              ...(reportCard.annualPosition != null ? [{ label: t('Annual Position'), value: `${ordinal(reportCard.annualPosition)}${reportCard.annualClassSize ? `/${reportCard.annualClassSize}` : ''}` }] : []),
            ]
        ).map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={[styles.summaryValue, item.color ? { color: item.color } : null]}>{item.value}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Subjects */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isCompetency ? t('Subject Ratings') : isUniversity ? t('Course Scores') : t('Subject Scores')}</Text>
        {subjects.map((subject) => {
          const entry = entries.find((e) => e.subjectId === subject.id)
          const isFilled = entry?.score !== '' && entry?.score != null
          const score = isFilled ? Number(entry!.score) : 0
          const g = isFilled ? gradeFromScore(score, subject.maxScore, gradingRanges) : null
          // A rating is recorded on the class sheet, never typed here — there is no
          // number to type, and a picker per subject on a read-only card would be a
          // second, competing place to change one.
          if (isCompetency) {
            const rating = entry?.grade
            return (
              <View key={subject.id} style={styles.subjectRow}>
                <Text style={styles.subjectName}>{subject.name}</Text>
                {/* Resolved against the school's levels, falling back to the stored
                    wording, so a rating from an earlier scale still reads correctly
                    instead of showing as "Not recorded". */}
                {(() => {
                  const level = findLevel(levels, rating)
                  if (!level) return <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('Not recorded')}</Text>
                  return (
                    <View style={[styles.gradePill, { backgroundColor: `${level.color}18` }]}>
                      <Text style={[styles.gradeText, { color: level.color }]}>
                        {levelLabel(level, reportCard?.school?.language === 'FR' ? 'FR' : 'EN', t)}
                      </Text>
                    </View>
                  )
                })()}
              </View>
            )
          }
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
            <Text style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>{isCompetency ? t('Every subject must be rated first.') : t('All subject sequences must be filled first.')}</Text>
          </View>
        ) : (
          <Text style={styles.remarksReadOnly}>{reportCard.remarks || '—'}</Text>
        )}
      </View>

      {/* Actions — class master can save marks but not publish */}
      {isDraft && (
        <View style={styles.actions}>
          {/* Marks are typed here; ratings never are (they are recorded on the class
              sheet), so a rated card has nothing for this button to save. */}
          {!isCompetency && (
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
          )}
          {user?.role !== 'CLASS_MASTER' && (
            <>
              {!canPublish && (
                <View style={{ flexDirection: 'row', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: allSeqsFilled ? '#dcfce7' : '#fee2e2' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: allSeqsFilled ? '#16a34a' : '#ef4444' }}>{allSeqsFilled ? '✓' : '✗'} {isCompetency ? t('Ratings') : t('Sequences')}</Text>
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
