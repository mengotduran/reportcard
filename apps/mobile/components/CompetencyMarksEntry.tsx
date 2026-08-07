import { useEffect, useState, useCallback, useRef } from 'react'
import { useTheme, Colors } from '@/lib/useTheme'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Switch, Animated,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getClassOverview, getReportCard, createReportCard,
  saveEntries, setPastTermGrant,
} from '@/lib/api/reportcards'
import { COMPETENCY_RATINGS, CompetencyRating, RATING_COLORS, isCompetencyRating } from '@/lib/competency'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { onRealtimeDebounced } from '@/lib/socket'

/**
 * Marks entry for a COMPETENCY class (nursery / pre-primary) on a phone.
 *
 * The twin of the numeric sheet, minus everything a rated class does not have: no score,
 * no sequence tabs, no maximum, no grading scale, no copy-from-the-other-sequence. One
 * pupil, one of three ratings, tapped rather than typed — which also means no keyboard,
 * which is the whole reason this is worth a screen of its own on mobile.
 *
 * The locks are deliberately identical to the numeric sheet's: a published card, the
 * school's marks policy, and a term that has closed.
 */

interface Row {
  studentId: string
  name: string
  reportCardId: string | null
  /** '' means not yet recorded, which is a legitimate saved state. */
  rating: CompetencyRating | ''
  isLocked: boolean
  isPublished?: boolean
}

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

export default function CompetencyMarksEntry() {
  const { subjectId, classLevel, termId, termName, subjectName } = useLocalSearchParams<{
    subjectId: string; classLevel: string; termId: string; termName: string; subjectName: string
  }>()
  const navigation = useNavigation()
  const { user, school } = useAuthStore()
  const { colors } = useTheme()
  const t = useT()
  const s = makeStyles(colors)
  const pulse = useSkeletonPulse()

  const decodedSubjectId = decodeURIComponent(subjectId)
  const decodedClass = decodeURIComponent(classLevel)
  const decodedSubjectName = decodeURIComponent(subjectName)

  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  // A competency class only ever exists at a primary school, so an admin never has
  // standing to record ratings and a teacher loses it only under ADMIN_ONLY.
  const adminOnlyMarks = isAdminRole ? true : school?.marksEntryMode === 'ADMIN_ONLY'

  const [rows, setRows] = useState<Row[]>([])
  const loadedRatingsRef = useRef<Record<string, string>>({})
  const [staleFromElsewhere, setStaleFromElsewhere] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [isCurrentTerm, setIsCurrentTerm] = useState(true)
  const [pastTermEditGranted, setPastTermEditGranted] = useState(false)
  const [grantSaving, setGrantSaving] = useState(false)
  const pastTermLockedForTeacher = !isAdminRole && !isCurrentTerm && !pastTermEditGranted

  useEffect(() => {
    navigation.setOptions({ title: decodedSubjectName })
  }, [decodedSubjectName])

  const fetchData = useCallback(async () => {
    // One request for the whole class: ratings ride along on the overview's entries.
    const overview = await getClassOverview(termId, decodedClass, decodedSubjectId)
    setIsCurrentTerm(overview.isCurrentTerm)
    setPastTermEditGranted(overview.pastTermEditGranted)
    const freshPastTermLocked = !isAdminRole && !overview.isCurrentTerm && !overview.pastTermEditGranted
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))
    const loaded: Row[] = sorted.map((st) => {
      const entry = st.reportCard?.entries?.find((e) => e.subjectId === decodedSubjectId)
      // Anything that isn't one of the three reads as unrecorded: a class switched over
      // from marks can still be holding a stale numeric grade here.
      const rating: CompetencyRating | '' = isCompetencyRating(entry?.grade) ? (entry!.grade as CompetencyRating) : ''
      const isPublished = st.reportCard?.status === 'PUBLISHED'
      const grantedToMe = st.reportCard?.marksEditGrantedTo === user?.id
      const frozenByPublish = isPublished && !grantedToMe
      return {
        studentId: st.id, name: st.name,
        reportCardId: st.reportCard?.id ?? null,
        rating,
        isLocked: frozenByPublish || (adminOnlyMarks && !grantedToMe) || freshPastTermLocked,
        isPublished: frozenByPublish,
      }
    })
    setRows(loaded)
    loadedRatingsRef.current = Object.fromEntries(loaded.map((r) => [r.studentId, r.rating]))
    setStaleFromElsewhere(false)
  }, [termId, decodedClass, decodedSubjectId, isAdminRole, adminOnlyMarks, user?.id])

  useFocusEffect(useCallback(() => {
    setLoading(true)
    setLoadError('')
    fetchData()
      .catch(() => setLoadError(t('Could not load the ratings. Check your connection and try again.')))
      .finally(() => setLoading(false))
  }, [fetchData]))

  const dirtyRows = rows.filter((r) => !r.isLocked && (loadedRatingsRef.current[r.studentId] ?? '') !== r.rating)
  const isDirtyRef = useRef(false)
  isDirtyRef.current = dirtyRows.length > 0

  // Never refetch over unsaved picks — offer the reload and let the user decide.
  useEffect(() => onRealtimeDebounced('marks:changed', () => {
    if (isDirtyRef.current) setStaleFromElsewhere(true)
    else fetchData().catch(() => {})
  }), [fetchData])

  const editableRows = rows.filter((r) => !r.isLocked)
  const publishedCount = rows.filter((r) => r.isPublished).length
  const filled = rows.filter((r) => r.rating !== '').length

  const setRating = (studentId: string, rating: CompetencyRating) =>
    setRows((prev) => prev.map((r) =>
      // Tapping the rating a pupil already has clears it, so undoing a mis-tap is the
      // same gesture that made it — there is no fourth "not recorded" button.
      r.studentId === studentId && !r.isLocked ? { ...r, rating: r.rating === rating ? '' : rating } : r
    ))

  // Fills only the pupils with nothing recorded yet, so it can never overwrite a rating
  // someone deliberately picked — which is what lets it act without a confirmation.
  const fillBlanks = (rating: CompetencyRating) =>
    setRows((prev) => prev.map((r) => (!r.isLocked && r.rating === '' ? { ...r, rating } : r)))

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
    if (dirtyRows.length === 0) return
    setSaving(true)
    try {
      const withCards = await Promise.all(dirtyRows.map(async (r) => {
        if (!r.reportCardId) {
          const data = await createReportCard({ studentId: r.studentId, termId })
          return { ...r, reportCardId: data.reportCard.id }
        }
        return r
      }))
      // The save replaces a card's entries wholesale, so every subject already on the card
      // is re-sent or it would be dropped. Only THIS subject carries a `rating` key; the
      // others go without one, which tells the API to keep the rating each already has.
      const rcDetails = await Promise.all(withCards.map((r) => getReportCard(r.reportCardId!)))
      await Promise.all(withCards.map((r, i) => {
        const rc = rcDetails[i]
        const allSubjectIds = Array.from(new Set([...rc.entries.map((e) => e.subject.id), decodedSubjectId]))
        const entries = allSubjectIds.map((sid) =>
          sid === decodedSubjectId
            ? { subjectId: sid, rating: r.rating === '' ? null : r.rating }
            : { subjectId: sid })
        return saveEntries(r.reportCardId!, { entries: entries as any })
      }))
      Alert.alert(t('Saved'), t('Ratings saved.'))
      fetchData()
    } catch {
      Alert.alert(t('Error'), t('Failed to save ratings.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View style={s.colNum}><Text style={s.headerText}>#</Text></View>
        <View style={s.colName}><Text style={s.headerText}>{t('PUPIL')}</Text></View>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={s.pupilCard}>
            <Animated.View style={{ backgroundColor: colors.border, borderRadius: 4, opacity: pulse, height: 12, width: `${50 + (i % 4) * 10}%`, marginBottom: 10 }} />
            <Animated.View style={{ backgroundColor: colors.border, borderRadius: 8, opacity: pulse, height: 34 }} />
          </View>
        ))}
      </ScrollView>
    </View>
  )

  if (loadError) return (
    <View style={[s.container, s.center]}>
      <Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />
      <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10, marginBottom: 14 }}>{loadError}</Text>
      <TouchableOpacity
        onPress={() => { setLoading(true); setLoadError(''); fetchData().catch(() => setLoadError(t('Could not load the ratings. Check your connection and try again.'))).finally(() => setLoading(false)) }}
        style={{ backgroundColor: '#F03E2F', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('Retry')}</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <View style={s.container}>
      {/* Info bar */}
      <View style={s.infoBar}>
        <Text style={s.infoText}>{decodedClass} · {filled}/{rows.length} {t('rated')}</Text>
        {termName ? <Text style={s.infoText}>{termName}</Text> : null}
      </View>

      {publishedCount > 0 && (
        <View style={s.lockBanner}>
          <Text style={s.lockBannerText}>
            🔒 {publishedCount === rows.length ? t('All cards published') : `${publishedCount} ${t('card(s) published')}`}
            {' '}{isAdminRole ? t('· unpublish to edit') : t('· contact admin to edit')}
          </Text>
        </View>
      )}

      {!isCurrentTerm && (
        isAdminRole ? (
          <View style={[s.noticeBar, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={[s.noticeText, { flex: 1, marginRight: 8 }]}>
              {t('This term has ended. Allow teachers to edit ratings here anyway?')}
            </Text>
            {grantSaving ? <ActivityIndicator size="small" color="#1d4ed8" /> : (
              <Switch value={pastTermEditGranted} onValueChange={handleTogglePastTermGrant} />
            )}
          </View>
        ) : pastTermLockedForTeacher && (
          <View style={s.noticeBar}>
            <Text style={s.noticeText}>
              {t("This term is no longer current, so it's locked. Ask an admin to grant you access if you need to fix something here.")}
            </Text>
          </View>
        )
      )}

      {adminOnlyMarks && (
        <View style={s.noticeBar}>
          <Text style={s.noticeText}>
            {isAdminRole
              ? t('Ratings are recorded by teachers at this school. You can check them here, but not change them.')
              : t('Ratings are recorded by the administration at this school. You can check them here, but not change them.')}
          </Text>
        </View>
      )}

      {staleFromElsewhere && (
        <TouchableOpacity
          style={s.staleBar}
          activeOpacity={0.7}
          onPress={() => { setLoading(true); fetchData().catch(() => {}).finally(() => setLoading(false)) }}
        >
          <Ionicons name="refresh-outline" size={15} color="#92400e" />
          <Text style={s.staleBarText}>
            {t('Someone else saved ratings for this class. Tap to reload, or finish and save yours first.')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Fill the blanks — a nursery class is mostly one rating with a few exceptions, so
          this is the difference between three taps and sixty. Blank pupils only. */}
      {editableRows.some((r) => r.rating === '') && (
        <View style={s.fillBar}>
          <Text style={s.fillBarLabel}>{t('Rate everyone still blank:')}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {COMPETENCY_RATINGS.map((rating) => (
              <TouchableOpacity key={rating} onPress={() => fillBlanks(rating)}
                style={[s.fillChip, { borderColor: RATING_COLORS[rating] }]}>
                <Text style={[s.fillChipText, { color: RATING_COLORS[rating] }]}>{t(rating)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {rows.length === 0 && (
          <View style={[s.center, { paddingTop: 60 }]}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>
              {t('No pupils in this class yet.')}
            </Text>
          </View>
        )}

        {/* A card per pupil rather than a table row: three word-sized buttons need the
            full width of a phone, and a nursery register is short enough to scroll. */}
        {rows.map((row, index) => (
          <View key={row.studentId} style={[s.pupilCard, row.isLocked && s.pupilCardLocked]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text style={s.rowNum}>{index + 1}</Text>
              <Text style={s.nameText} numberOfLines={1}>{row.name}</Text>
              {row.isLocked && <Text style={{ fontSize: 11 }}>🔒</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {COMPETENCY_RATINGS.map((rating) => {
                const picked = row.rating === rating
                const c = RATING_COLORS[rating]
                return (
                  <TouchableOpacity
                    key={rating}
                    disabled={row.isLocked}
                    onPress={() => setRating(row.studentId, rating)}
                    activeOpacity={0.7}
                    style={[
                      s.ratingBtn,
                      { borderColor: picked ? c : colors.border, backgroundColor: picked ? `${c}1a` : 'transparent' },
                    ]}>
                    <Text style={[s.ratingBtnText, { color: picked ? c : colors.textSecondary, fontWeight: picked ? '700' : '500' }]}
                      numberOfLines={2}>
                      {t(rating)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {rows.length > 0 && (
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.saveBtn, (saving || editableRows.length === 0 || dirtyRows.length === 0) && s.disabled]}
            onPress={handleSaveAll}
            disabled={saving || editableRows.length === 0 || dirtyRows.length === 0}
            activeOpacity={0.8}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>
                    {editableRows.length === 0
                      ? t('All Cards Published')
                      : dirtyRows.length === 0
                        ? t('No changes to save')
                        : `${t('Save Ratings')} (${dirtyRows.length})`}
                  </Text>
                </>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const HEADER_BG = '#1a0605'

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { justifyContent: 'center', alignItems: 'center' },
  infoBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoText: { fontSize: 12, color: colors.textSecondary },
  headerRow: { flexDirection: 'row', backgroundColor: HEADER_BG },
  headerText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  colNum: { width: 36, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  colName: { flex: 1, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10 },

  lockBanner: { backgroundColor: 'rgba(240,62,47,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(240,62,47,0.2)', paddingHorizontal: 14, paddingVertical: 8 },
  lockBannerText: { fontSize: 12, color: '#c2410c' },
  noticeBar: { backgroundColor: '#eff6ff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#bfdbfe' },
  noticeText: { fontSize: 12.5, color: '#1d4ed8' },
  staleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef3c7', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#fde68a',
  },
  staleBarText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400e' },

  fillBar: {
    backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8,
  },
  fillBarLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  fillChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  fillChipText: { fontSize: 11.5, fontWeight: '700' },

  pupilCard: {
    backgroundColor: colors.card, marginHorizontal: 10, marginTop: 8,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border,
  },
  pupilCardLocked: { opacity: 0.55 },
  rowNum: { fontSize: 11, color: colors.textMuted, minWidth: 16 },
  nameText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  ratingBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  ratingBtnText: { fontSize: 11.5, textAlign: 'center' },

  footer: { padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  saveBtn: {
    backgroundColor: '#F03E2F', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
