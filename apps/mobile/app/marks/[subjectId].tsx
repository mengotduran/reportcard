import { useEffect, useState, useCallback, useRef } from 'react'
import { useTheme, Colors } from '@/lib/useTheme'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Keyboard, Animated, Switch,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getClassOverview, getReportCard, createReportCard,
  saveEntries, getSubjects, setPastTermGrant,
} from '@/lib/api/reportcards'
import { getGradingScale, gradeFromScore, isFailingMark, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { useAuthStore } from '@/lib/store/auth.store'
import { seqFull, seqShort } from '@/lib/sequences'
import { useT, useLang } from '@/lib/i18n'
import { onRealtimeDebounced } from '@/lib/socket'
import { getClasses, GradingMode } from '@/lib/api/classes'
import CompetencyMarksEntry from '@/components/CompetencyMarksEntry'
import { adminMayEnterMarks } from '@/lib/marksPermission'

// University marking split: CA out of 30, exam out of 70, course out of 100.
const EXAM_MAX = 70
const COURSE_MAX = 100

/**
 * Which sheet this class gets: the numeric grid below, or the rating picker in
 * CompetencyMarksEntry. The two share almost nothing — a rated class has no score, no
 * sequence, no maximum and no grade — so they are separate screens rather than one
 * screen full of branches.
 *
 * Resolved from the class list, never guessed from the class NAME: names are free text
 * (a French section calls these Maternelle), which is why gradingMode is a stored field.
 * An unknown class falls back to NUMERIC, matching the API's own default.
 */
export default function MarksEntryRoute() {
  const { classLevel } = useLocalSearchParams<{ classLevel: string }>()
  const decodedClass = decodeURIComponent(classLevel)
  const { colors } = useTheme()
  const [mode, setMode] = useState<GradingMode | null>(null)

  useEffect(() => {
    let cancelled = false
    getClasses()
      .then(({ classLevels }) => {
        if (!cancelled) setMode(classLevels.find((c) => c.name === decodedClass)?.gradingMode ?? 'NUMERIC')
      })
      .catch(() => { if (!cancelled) setMode('NUMERIC') })
    return () => { cancelled = true }
  }, [decodedClass])

  // Neither sheet, briefly: showing the numeric one first and swapping would flash a
  // marks grid at a nursery teacher on every open.
  if (mode === null) return (
    <View style={{ flex: 1, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#F03E2F" />
    </View>
  )

  return mode === 'COMPETENCY' ? <CompetencyMarksEntry /> : <NumericMarksEntry />
}

interface Row {
  studentId: string
  name: string
  studentIdCode: string
  reportCardId: string | null
  score: string
  otherSeqScore: number | null
  /** Not editable, for ANY reason (published, or not eligible for this resit). */
  isLocked: boolean
  /** Locked specifically by publishing — the only case an admin can unlock. Kept apart
   *  from isLocked so the banner can't blame publishing for a row that simply passed. */
  isPublished?: boolean
  resitEligible?: boolean
}

// Slow pulse (opacity 0.5 <-> 1) shared by every placeholder block in the skeleton below.
function useSkeletonPulse() {
  const anim = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  return anim
}

function SkeletonBlock({ colors, opacity, style }: { colors: Colors; opacity: Animated.Value; style?: any }) {
  return <Animated.View style={[{ backgroundColor: colors.border, borderRadius: 4, opacity }, style]} />
}

// Mirrors the real table's structure (header + N rows, same column widths) instead of a
// plain centered spinner, so the screen doesn't blank out then pop — and it can't be
// mistaken for actual data, unlike leaving stale rows on screen during a refetch.
function MarksSkeleton({ colors, s }: { colors: Colors; s: any }) {
  const opacity = useSkeletonPulse()
  return (
    <>
      <View style={s.headerRow}>
        <View style={s.colNum}><Text style={s.headerText}>#</Text></View>
        <View style={s.colName}><Text style={s.headerText}>STUDENT NAME</Text></View>
        <View style={s.colScore}><Text style={s.headerText}>MARKS</Text></View>
        <View style={s.colRemark}><Text style={s.headerText}>PERFORMANCE</Text></View>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={[s.dataRow, i % 2 === 1 && s.dataRowAlt]}>
            <View style={s.colNum}><SkeletonBlock colors={colors} opacity={opacity} style={{ width: 14, height: 10 }} /></View>
            <View style={[s.colName, { justifyContent: 'center' }]}>
              <SkeletonBlock colors={colors} opacity={opacity} style={{ width: `${55 + (i % 4) * 10}%`, height: 12 }} />
            </View>
            <View style={s.colScore}><SkeletonBlock colors={colors} opacity={opacity} style={{ width: 36, height: 22, borderRadius: 6 }} /></View>
            <View style={s.colRemark}><SkeletonBlock colors={colors} opacity={opacity} style={{ width: 64, height: 18, borderRadius: 10 }} /></View>
          </View>
        ))}
      </ScrollView>
    </>
  )
}

function NumericMarksEntry() {
  const { subjectId, classLevel, termId, termName, subjectName, sequence } = useLocalSearchParams<{
    subjectId: string; classLevel: string; termId: string
    termName: string; subjectName: string; sequence: string
  }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { user, school } = useAuthStore()
  const { colors, isDark } = useTheme()
  const t = useT()
  const lang = useLang()
  const s = makeSStyles(colors)
  const seqIndex = Number(sequence)
  const isUniversity = school?.type === 'UNIVERSITY'
  const isPrimary = school?.type === 'PRIMARY'
  // The school records marks centrally AND I am a teacher. Admins are never locked out.
  // Same rule as the web grid; the API is the real gate either way.
  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  // An admin was never locked out here even when the API would refuse the save (a university
  // outside ADMIN_ONLY), so the grid invited an edit and then 403'd on Save. Now it asks the
  // same question the API does: see adminMayEnterMarks.
  const adminOnlyMarks = isAdminRole
    ? !adminMayEnterMarks(school?.type, school?.marksEntryMode)
    : school?.marksEntryMode === 'ADMIN_ONLY'
  // Under ADMIN_ONLY, a university teacher may still record the CA themselves — only the
  // Exam and Resit stay the administration's. Same rule as the web grid.
  const caExemptForTeacher = adminOnlyMarks && isUniversity && seqIndex === 0
  const isResit = isUniversity && seqIndex === 2
  const seqLabel = isUniversity
    ? (seqIndex === 0 ? 'CA' : seqIndex === 1 ? 'Exam' : 'Resit Exam')
    : isPrimary ? (seqIndex === 0 ? t('Test') : t('Exam')) : seqFull(termName, seqIndex, lang)
  const decodedSubjectId = decodeURIComponent(subjectId)
  const decodedClass = decodeURIComponent(classLevel)
  const decodedSubjectName = decodeURIComponent(subjectName)

  const [rows, setRows] = useState<Row[]>([])
  // Scores exactly as last loaded from the server, keyed by student. `rows` is the EDIT
  // BUFFER, so this is the only way to tell a typed-but-unsaved grid from a clean one.
  // Derived by comparison rather than a flag set in each edit handler, so any future edit
  // path is covered without remembering to mark it dirty.
  const loadedScoresRef = useRef<Record<string, string>>({})
  // Someone else saved marks for this class while this grid held unsaved edits.
  const [staleFromElsewhere, setStaleFromElsewhere] = useState(false)
  const [maxScore, setMaxScore] = useState(20)
  // PRIMARY only — the Test's ceiling; the Exam gets what is left of maxScore. The phone
  // used to ignore this split entirely and cap BOTH components at the subject total, so a
  // Test out of 30 accepted 100 and the header promised marks the sheet could not hold.
  const [testMaxScore, setTestMaxScore] = useState(30)
  const effectiveMax = isUniversity
    ? (seqIndex === 0 ? 30 : 70)
    : isPrimary
      ? (seqIndex === 0 ? testMaxScore : Math.max(0, maxScore - testMaxScore))
      : maxScore
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, TextInput | null>>({})
  // Whether this term is still the currently active one, and (if not) whether an admin
  // has unlocked THIS subject for teachers to edit anyway. Defaults to true/false so
  // nothing looks locked while the real values are still loading.
  const [isCurrentTerm, setIsCurrentTerm] = useState(true)
  const [pastTermEditGranted, setPastTermEditGranted] = useState(false)
  const [grantSaving, setGrantSaving] = useState(false)
  // A teacher may only edit a NON-current term if an admin has explicitly granted this
  // exact subject+term. Admins are never subject to this — only a teacher's own standing
  // changes once a term closes. Same rule the API actually enforces in saveEntries.
  const pastTermLockedForTeacher = !isAdminRole && !isCurrentTerm && !pastTermEditGranted

  useEffect(() => {
    navigation.setOptions({ title: `${decodedSubjectName} · ${seqLabel}` })
  }, [decodedSubjectName, seqLabel])

  const fetchData = useCallback(async () => {
    const [subjectData, scaleData] = await Promise.all([
      getSubjects(),
      getGradingScale().catch(() => ({ ranges: DEFAULT_RANGES })),
    ])
    const subject = subjectData.subjects.find((s) => s.id === decodedSubjectId)
    if (subject?.maxScore) setMaxScore(subject.maxScore)
    if (subject?.testMaxScore) setTestMaxScore(subject.testMaxScore)
    if (scaleData.ranges?.length > 0) setGradingRanges(scaleData.ranges)

    const overview = await getClassOverview(termId, decodedClass, decodedSubjectId)
    setIsCurrentTerm(overview.isCurrentTerm)
    setPastTermEditGranted(overview.pastTermEditGranted)
    // Computed from THIS fetch's own result, not the outer pastTermLockedForTeacher —
    // that's derived from state which wouldn't be updated yet inside this same closure.
    const freshPastTermLocked = !isAdminRole && !overview.isCurrentTerm && !overview.pastTermEditGranted
    // Sort alphabetically
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))

    // Rows come straight off the overview response — ONE request for the whole class.
    // This used to fetch every student's report card individually (16 students = 16
    // requests), which on a phone's wifi routinely blew the 15s timeout.
    const loaded: Row[] = sorted.map((s) => {
        let score = ''
        let otherSeqScore: number | null = null
        let resitEligible = false
        if (s.reportCard) {
          {
            const entry = s.reportCard.entries?.find((e) => e.subjectId === decodedSubjectId)
            if (entry) {
              if (isResit) {
                score = entry.resitScore != null ? String(entry.resitScore) : ''
                // Same rule as the web marks grid: offered to anyone who FAILED THE COURSE,
                // whatever their exam mark. Only the exam is re-sat, so a student who passed
                // the exam but failed the course on a weak CA is exactly who it helps.
                // Judged on the ORIGINAL CA+Exam so the row stays editable once the resit
                // mark is in, and via the school's own scale rather than a hardcoded 'F'.
                const ca = entry.seq1Score, exam = entry.seq2Score
                resitEligible = ca != null && exam != null
                  && isFailingMark(ca + exam, COURSE_MAX, scaleData.ranges)
              } else {
                score = seqIndex === 0
                  ? (entry.seq1Score != null ? String(entry.seq1Score) : '')
                  : (entry.seq2Score != null ? String(entry.seq2Score) : '')
                otherSeqScore = seqIndex === 0 ? entry.seq2Score : entry.seq1Score
              }
            }
          }
        }
        const isPublished = s.reportCard?.status === 'PUBLISHED'
        const grantedToMe = s.reportCard?.marksEditGrantedTo === user?.id
        // Publishing freezes a card for EVERYONE, the administration included: unpublish
        // to change a mark. Same rule as the web grid, and the API enforces it.
        const frozenByPublish = isPublished && !grantedToMe
        return {
          studentId: s.id, name: s.name, studentIdCode: s.studentId, reportCardId: s.reportCard?.id ?? null,
          score, otherSeqScore,
          // Marks recorded centrally: readable, not editable (see the web grid) — except
          // the CA tab, which a university teacher may still fill under this policy.
          isLocked: frozenByPublish || (isResit && !resitEligible) || (adminOnlyMarks && !grantedToMe && !caExemptForTeacher) || freshPastTermLocked,
          isPublished: frozenByPublish,
          resitEligible,
        }
      })
    setRows(loaded)
    // Baseline for "does this grid hold unsaved edits" — see isDirty below. Captured from
    // the same rows just rendered, so a fresh load always starts clean.
    loadedScoresRef.current = Object.fromEntries(loaded.map((r) => [r.studentId, r.score]))
    setStaleFromElsewhere(false)
  }, [termId, decodedClass, decodedSubjectId, seqIndex, isAdminRole])

  useFocusEffect(useCallback(() => {
    // Re-runs whenever `fetchData`'s identity changes — including when the CA/Exam/Resit
    // tab switches `seqIndex` via setParams, not just on focus. Without setLoading(true)
    // here, the OLD sequence's rows stayed on screen but got re-labeled/re-graded against
    // the NEW sequence's max score (e.g. a CA mark out of 30 briefly graded as an Exam
    // mark out of 70 — a false "FAIL"), until the refetch quietly resolved underneath.
    setLoading(true)
    setLoadError('')
    fetchData()
      .catch(() => setLoadError(t('Could not load the marks. Check your connection and try again.')))
      .finally(() => setLoading(false))
  }, [fetchData]))

  // Unsaved edits present? Compared against the last load rather than tracked by a flag,
  // so typing a mark and then undoing it correctly reads as clean again.
  const isDirty = rows.some((r) => (loadedScoresRef.current[r.studentId] ?? '') !== r.score)
  // Mirrored into a ref so the subscription below reads the CURRENT value without
  // re-subscribing on every keystroke.
  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  // Someone else saved marks for this class/subject.
  //
  // This screen is the one that must NOT blindly refetch: `rows` is the edit buffer, so
  // refetching over a half-typed column would destroy work with no undo. Clean grid, silent
  // refresh; dirty grid, the user is told and decides. Debounced because the signal arrives
  // once per student in a class save.
  useEffect(() => onRealtimeDebounced('marks:changed', () => {
    if (isDirtyRef.current) setStaleFromElsewhere(true)
    else fetchData().catch(() => {})
  }), [fetchData])

  const updateScore = (studentId: string, value: string) => {
    // Allow digits + a single decimal point (e.g. 15.5); clamp to maxScore only
    // when already above it, without reformatting (keeps a trailing "." typeable).
    let clean = value.replace(/[^0-9.]/g, '')
    const firstDot = clean.indexOf('.')
    if (firstDot !== -1) clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '')
    if (clean !== '' && clean !== '.' && Number(clean) > effectiveMax) clean = String(effectiveMax)
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, score: clean } : r))
  }

  const editableRows = rows.filter(r => !r.isLocked)
  // Only rows locked BY PUBLISHING. Counting every locked row told teachers on the Resit
  // tab that N cards were published and to contact their admin, when those rows were
  // really just students who passed and were never resit-eligible.
  const publishedCount = rows.filter(r => r.isPublished).length

  // Admin-only: unlock/lock this exact subject+term for teachers to edit again, once it's
  // no longer current. Contextual here rather than a separate management screen — the
  // admin is already looking at exactly the (subject, term) pair this decision is about.
  const handleTogglePastTermGrant = async (value: boolean) => {
    setGrantSaving(true)
    try {
      const res = await setPastTermGrant(decodedSubjectId, termId, value)
      setPastTermEditGranted(res.granted)
    } catch {
      Alert.alert(t('Error'), t('Failed to update access'))
    } finally {
      setGrantSaving(false)
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    Keyboard.dismiss()
    try {
      const updated = await Promise.all(
        editableRows.map(async (r) => {
          if (!r.reportCardId) {
            const data = await createReportCard({ studentId: r.studentId, termId })
            return { ...r, reportCardId: data.reportCard.id }
          }
          return r
        })
      )

      const rcDetails = await Promise.all(updated.map((r) => getReportCard(r.reportCardId!)))

      await Promise.all(
        updated.map((r, i) => {
          const rc = rcDetails[i]
          const allSubjectIds = Array.from(new Set([
            ...rc.entries.map((e) => e.subject.id),
            decodedSubjectId,
          ]))

          const entries = allSubjectIds.map((sid) => {
            const existing = rc.entries.find((e) => e.subject.id === sid) as any
            if (sid === decodedSubjectId) {
              const cur = r.score !== '' ? Number(r.score) : null
              return {
                subjectId: sid,
                seq1Score: seqIndex === 0 ? cur : (existing?.seq1Score ?? null),
                seq2Score: seqIndex === 1 ? cur : (existing?.seq2Score ?? null),
                resitScore: isResit ? cur : (existing?.resitScore ?? null),
                // no remarks — API auto-fills from grading scale
              }
            }
            return {
              subjectId: sid,
              seq1Score: existing?.seq1Score ?? undefined,
              seq2Score: existing?.seq2Score ?? undefined,
              resitScore: existing?.resitScore ?? undefined,
              score: existing?.score ?? 0,
              // no remarks — API auto-fills from grading scale
            }
          })

          return saveEntries(r.reportCardId!, { entries: entries as any })
        })
      )

      Alert.alert(t('Saved'), t('Marks saved for all students.'))
      fetchData()
    } catch {
      Alert.alert(t('Error'), t('Failed to save marks.'))
    } finally {
      setSaving(false)
    }
  }

  const filled = rows.filter((r) => r.score !== '').length
  const otherSeqLabel = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqFull(termName, seqIndex === 0 ? 1 : 0, lang)
  const otherSeqShort = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqShort(termName, seqIndex === 0 ? 1 : 0, lang)

  // Same lock every individual cell already respects (row.isLocked) — otherwise this was
  // a back door around ADMIN_ONLY: a teacher couldn't type into a locked Exam cell, but
  // could still bulk-fill every row from CA through this button.
  const handleCopyFromOther = () => {
    const hasCurrent = rows.some((r) => !r.isLocked && r.score !== '')
    const doCopy = () => {
      setRows((prev) =>
        prev.map((r) =>
          !r.isLocked && r.otherSeqScore !== null
            ? { ...r, score: String(r.otherSeqScore) }
            : r
        )
      )
    }
    if (hasCurrent) {
      Alert.alert(
        `${t('Copy from')} ${otherSeqLabel}`,
        t('This will overwrite all current marks with the other sequence scores. Continue?'),
        [{ text: t('Cancel'), style: 'cancel' }, { text: t('Copy'), onPress: doCopy }]
      )
    } else {
      const hasOther = rows.some((r) => !r.isLocked && r.otherSeqScore !== null)
      if (!hasOther) {
        Alert.alert(t('No data'), `${otherSeqLabel} ${t('has no marks yet.')}`)
        return
      }
      doCopy()
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <View style={s.container}>
        {loading ? (
          <MarksSkeleton colors={colors} s={s} />
        ) : loadError ? (
          <View style={s.center}>
            <Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, marginBottom: 14 }}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => { setLoading(true); setLoadError(''); fetchData().catch(() => setLoadError(t('Could not load the marks. Check your connection and try again.'))).finally(() => setLoading(false)) }}
              style={{ backgroundColor: '#F03E2F', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('Retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <>
        {/* Info bar */}
        <View style={s.infoBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <Text style={s.infoText}>{decodedClass} · {filled}/{rows.length} {t('filled')}</Text>
            {isUniversity && termName ? (
              <View style={{ backgroundColor: '#FEF2F1', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(240,62,47,0.2)' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#F03E2F' }}>{termName}</Text>
              </View>
            ) : null}
          </View>
          {/* Switch assessment without leaving the sheet, same as the web grid. setParams
              swaps the sequence in place rather than stacking a history entry, and the
              fetch keys on it, so the marks reload. */}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(isUniversity ? [0, 1, 2] : [0, 1]).map((i) => (
              <TouchableOpacity key={i}
                onPress={() => router.setParams({ sequence: String(i) })}
                style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
                  borderColor: seqIndex === i ? '#F03E2F' : colors.border,
                  backgroundColor: seqIndex === i ? '#FEF2F1' : 'transparent',
                }}>
                <Text style={{ fontSize: 11, fontWeight: seqIndex === i ? '700' : '500', color: seqIndex === i ? '#F03E2F' : colors.textSecondary }}>
                  {isUniversity
                    ? (i === 0 ? t('CA') : i === 1 ? t('Exam') : t('Resit'))
                    : isPrimary ? (i === 0 ? t('Test') : t('Exam')) : seqShort(termName, i, lang)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Published lock banner */}
        {publishedCount > 0 && (
          <View style={s.lockBanner}>
            <Text style={s.lockBannerText}>
              {/* The remedy depends on who is reading: unpublishing is the admin's to do,
                  so telling them to "contact admin" would be a dead end. */}
              🔒 {publishedCount === rows.length ? t('All cards published') : `${publishedCount} ${t('card(s) published')}`}
              {' '}{isAdminRole ? t('· unpublish to edit') : t('· contact admin to edit')}
            </Text>
          </View>
        )}

        {/* Past-term lock — teacher's view: explains why a non-current term is read-only
            even though nothing here is published. Admin's view: a contextual toggle to
            unlock this exact subject+term, since they're already looking at it. */}
        {!isCurrentTerm && (
          isAdminRole ? (
            <View style={[s.resitBar, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={[s.resitBarText, { flex: 1, marginRight: 8 }]}>
                {t('This term has ended. Allow teachers to edit marks here anyway?')}
              </Text>
              {grantSaving ? <ActivityIndicator size="small" color="#1d4ed8" /> : (
                <Switch value={pastTermEditGranted} onValueChange={handleTogglePastTermGrant} />
              )}
            </View>
          ) : pastTermLockedForTeacher && (
            <View style={s.resitBar}>
              <Text style={s.resitBarText}>
                {t("This term is no longer current, so it's locked. Ask an admin to grant you access if you need to fix something here.")}
              </Text>
            </View>
          )
        )}

        {/* Someone else saved marks for this class while this grid holds unsaved edits.
            Offered, never applied automatically: reloading replaces the edit buffer, so
            discarding typed marks has to be the user's decision, not a background event's. */}
        {staleFromElsewhere && (
          <TouchableOpacity
            style={s.staleBar}
            activeOpacity={0.7}
            onPress={() => { setLoading(true); fetchData().catch(() => {}).finally(() => setLoading(false)) }}
          >
            <Ionicons name="refresh-outline" size={15} color="#92400e" />
            <Text style={s.staleBarText}>
              {t('Someone else saved marks for this class. Tap to reload, or finish and save yours first.')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Copy bar — resit has nothing to copy from */}
        {/* Why the sheet is read-only, or a teacher meets a dead grid and assumes the
            app is broken rather than seeing a school policy. */}
        {adminOnlyMarks && (
          <View style={s.resitBar}>
            <Text style={s.resitBarText}>
              {caExemptForTeacher
                ? t('Exam and Resit marks are entered by the administration at this school. You can record CA marks here.')
                : t('Marks are entered by the administration at this school. You can check the marks here, but not change them.')}
            </Text>
          </View>
        )}
        {isResit ? (
          <View style={s.resitBar}>
            <Text style={s.resitBarText}>
              {t('Only students who failed the course can resit, and only the exam is re-sat. Enter their new exam mark out of 70 here; their CA stays as it is, so a better exam mark can lift the total.')}
            </Text>
          </View>
        ) : editableRows.length > 0 && !isUniversity && !isPrimary && (
          // Pointless (and would look like a back door around ADMIN_ONLY) to show a
          // "fill this in" shortcut on a tab this user has no editable rows on at all.
          //
          // Never shown for universities: CA is out of 30 and Exam out of 70, so neither is
          // a sensible starting point for the other. Copying CA into Exam silently halves
          // every student, and copying Exam into CA writes scores above the CA maximum.
          // Primary/secondary sequences share one maxScore, which is the only case where
          // "same marks again" actually means anything.
          <TouchableOpacity style={s.copyBar} onPress={handleCopyFromOther} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={15} color="#7c3aed" />
            <Text style={s.copyBarText}>{t('Copy marks from')} {otherSeqShort} → {t('fill here')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#7c3aed" />
          </TouchableOpacity>
        )}

        {/* Table */}
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.colNum}><Text style={s.headerText}>#</Text></View>
            <View style={s.colName}><Text style={s.headerText}>{t('STUDENT NAME')}</Text></View>
            <View style={s.colScore}><Text style={s.headerText}>{isUniversity
                ? (seqIndex === 0 ? 'CA / 30' : seqIndex === 1 ? 'MARKS / 70' : 'RESIT / 70')
                : isPrimary
                  ? `${seqIndex === 0 ? t('TEST') : t('EXAM')} / ${effectiveMax}`
                  : `${t('MARKS /')} ${effectiveMax}`}</Text></View>
            <View style={s.colRemark}><Text style={s.headerText}>{t('PERFORMANCE')}</Text></View>
          </View>

          {rows.length === 0 && (
            <View style={[s.center, { paddingTop: 60 }]}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>
                {t('No students in this class yet.')}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                {t('Add students to')} {decodedClass} {t('before entering marks.')}
              </Text>
            </View>
          )}

          {rows.map((row, index) => {
            const num = Number(row.score)
            const hasScore = row.score !== ''
            const g = hasScore ? gradeFromScore(num, effectiveMax, gradingRanges) : null
            const isActive = activeCell === row.studentId

            return (
              <View key={row.studentId} style={[s.dataRow, index % 2 === 1 && s.dataRowAlt, row.isLocked && s.dataRowLocked]}>
                {/* Row number */}
                <View style={s.colNum}>
                  <Text style={s.rowNum}>{index + 1}</Text>
                </View>

                {/* Name */}
                <View style={s.colName}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={s.nameText} numberOfLines={1}>{row.name}</Text>
                    {row.isLocked && <Text style={{ fontSize: 10 }}>🔒</Text>}
                  </View>
                  {row.otherSeqScore !== null && (
                    <Text style={s.otherSeq}>
                      {otherSeqShort}: {row.otherSeqScore}
                    </Text>
                  )}
                </View>

                {/* Score input */}
                <TouchableOpacity
                  style={[s.colScore, s.cellTouch, isActive && s.cellActive]}
                  onPress={() => {
                    if (row.isLocked) return
                    setActiveCell(row.studentId)
                    inputRefs.current[row.studentId]?.focus()
                  }}
                  activeOpacity={row.isLocked ? 1 : 0.7}
                >
                  <TextInput
                    ref={(ref) => { inputRefs.current[row.studentId] = ref }}
                    style={[s.cellInput, isActive && s.cellInputActive]}
                    value={row.score}
                    onChangeText={(v) => updateScore(row.studentId, v)}
                    onFocus={() => setActiveCell(row.studentId)}
                    onBlur={() => setActiveCell(null)}
                    keyboardType="decimal-pad"
                    maxLength={String(effectiveMax).length + 1}
                    placeholder="--"
                    placeholderTextColor="#9ca3af"
                    returnKeyType="next"
                    selectTextOnFocus
                    editable={!row.isLocked}
                    onSubmitEditing={() => {
                      const next = rows[index + 1]
                      if (next) {
                        setActiveCell(next.studentId)
                        inputRefs.current[next.studentId]?.focus()
                      } else {
                        Keyboard.dismiss()
                        setActiveCell(null)
                      }
                    }}
                  />
                </TouchableOpacity>

                {/* Remark */}
                <View style={s.colRemark}>
                  {g ? (
                    <View style={[s.remarkPill, { backgroundColor: `${g.color}18` }]}>
                      <Text style={[s.remarkText, { color: g.color }]} numberOfLines={1}>{g.remark}</Text>
                    </View>
                  ) : (
                    <Text style={s.dashText}>--</Text>
                  )}
                </View>
              </View>
            )
          })}
        </ScrollView>

        {/* Footer — nothing to save or publish when there's no one on the roster yet,
            so the button (which used to read "All Cards Published", a straight lie in
            that case: 0 editable rows means either "everyone's published" OR "no
            students exist", and those are very different things to tell a teacher) is
            dropped entirely rather than shown disabled. */}
        {rows.length > 0 && (
          <View style={s.footer}>
            <TouchableOpacity style={[s.saveBtn, (saving || editableRows.length === 0) && s.disabled]} onPress={handleSaveAll} disabled={saving || editableRows.length === 0} activeOpacity={0.8}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={s.saveBtnText}>{editableRows.length === 0 ? t('All Cards Published') : t('Save All Marks')}</Text></>}
            </TouchableOpacity>
          </View>
        )}
        </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const HEADER_BG = '#1a0605'

const makeSStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSecondary, paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoText: { fontSize: 12, color: colors.textSecondary },
  seqPill: { fontSize: 12, fontWeight: '700', color: '#F03E2F', backgroundColor: '#FEF2F1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  copyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bgSecondary, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  copyBarText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7c3aed' },
  // Amber, not the copy bar's violet: this one reports a conflict rather than offering a
  // shortcut, and it must read as "something happened" at a glance.
  staleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef3c7', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#fde68a',
  },
  staleBarText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400e' },
  resitBar: {
    backgroundColor: '#eff6ff', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
  },
  resitBarText: { fontSize: 12.5, color: '#1d4ed8' },

  // Table
  headerRow: {
    flexDirection: 'row', backgroundColor: HEADER_BG,
    borderBottomWidth: 2, borderBottomColor: '#c73225',
  },
  dataRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  dataRowAlt: { backgroundColor: colors.bgSecondary },
  dataRowLocked: { opacity: 0.55 },
  lockBanner: { backgroundColor: 'rgba(240,62,47,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(240,62,47,0.2)', paddingHorizontal: 14, paddingVertical: 8 },
  lockBannerText: { fontSize: 12, color: '#c2410c' },

  colNum: { width: 36, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border },
  colName: { flex: 1, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: colors.border },
  colScore: { width: 88, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border },
  colRemark: { width: 100, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },

  headerText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowNum: { fontSize: 11, color: colors.textMuted },
  nameText: { fontSize: 13, fontWeight: '600', color: colors.text },
  otherSeq: { fontSize: 10, color: '#7c3aed', marginTop: 1 },

  cellTouch: { paddingVertical: 6 },
  cellActive: { backgroundColor: 'rgba(240,62,47,0.06)' },
  cellInput: {
    fontSize: 16, fontWeight: '700', color: colors.text,
    textAlign: 'center', width: '100%', paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  cellInputActive: { color: '#F03E2F' },

  remarkPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, maxWidth: 96 },
  remarkText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  dashText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },

  footer: { padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  saveBtn: {
    backgroundColor: '#F03E2F', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
