import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, Modal, Alert, FlatList, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyCoverage, getCoverage, getTeacherHoursTotals, CoverageRow, CoverageStatus, TeacherHoursTotal } from '@/lib/api/coverage'
import { getMyTimetable, getTeacherTimetable, MyTimetableSlot } from '@/lib/api/timetable'
import { getMyAbsences, getTeacherAbsences, getAbsenceCounts, reportAbsence, deleteAbsence, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { getTeachers, Teacher } from '@/lib/api/teachers'
import { formatHours } from '@/lib/formatHours'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

function dayOfWeekFor(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return ['SUNDAY', ...DAY_ORDER.slice(0, 6)][jsDay]
}

// Mirrors the API's slotHasPassed (Cameroon is UTC+1/WAT, no DST) — lets the UI grey
// these out up front instead of only finding out after a rejected request.
function slotHasPassed(dateStr: string, endTime: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = endTime.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh - 1, mm || 0) <= Date.now()
}

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = () => toDateStr(new Date())
const dayShort = (d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase()

/** This calendar week (Monday–Sunday, local time) as concrete dates, in DAY_ORDER. */
function thisWeekDates(): { date: string; dayOfWeek: string }[] {
  const now = new Date()
  const jsDay = now.getDay() // 0=Sun..6=Sat
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  return DAY_ORDER.map((dayOfWeek, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: toDateStr(d), dayOfWeek }
  })
}

const STATUS_COLOR: Record<CoverageStatus, string> = {
  NO_TARGET: '#6b7280', UNDER: '#ef4444', EXACT: '#16a34a', OVER: '#d97706',
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 90, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  subject: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  meta: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  absenceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border,
  },
  absenceText: { fontSize: 13, color: colors.text, flex: 1 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, backgroundColor: '#F03E2F',
    borderRadius: 28, width: 56, height: 56, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, marginBottom: 14 },
  dateChipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  dateChip: {
    alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary, minWidth: 58,
  },
  dateChipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  dateChipDay: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  dateChipDayActive: { color: 'rgba(255,255,255,0.85)' },
  dateChipNum: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 1 },
  dateChipNumActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  checkBoxChecked: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  checkLabel: { fontSize: 14, color: colors.text, flex: 1 },
  createBtn: { backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  // ── Admin attendance screen additions ──
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 12,
  },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: colors.text },
  coverageCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10,
  },
  teacherNameText: { fontSize: 14, fontWeight: '700', color: colors.text },
  pickerSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  teacherItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  teacherAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F1', justifyContent: 'center', alignItems: 'center' },
  teacherAvatarText: { fontSize: 14, fontWeight: '700', color: '#F03E2F' },
  absenceHint: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: colors.primary },
})

function Checkbox({ checked, onToggle, label, colors, disabled }: { checked: boolean; onToggle: () => void; label: string; colors: Colors; disabled?: boolean }) {
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={[styles.checkRow, disabled && { opacity: 0.5 }]} onPress={onToggle} disabled={disabled}>
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

// Inline preview cap on the "Absences reported" list — past this, "See all" hands off to
// a dedicated history screen instead of letting the card grow indefinitely.
const ABSENCES_PREVIEW_LIMIT = 5

function TeacherAttendanceScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const router = useRouter()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'

  const [rows, setRows] = useState<CoverageRow[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [periodsMissed, setPeriodsMissed] = useState(0)
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period missed') : t('periods missed')) : (n === 1 ? t('absence') : t('absences'))

  const [modalVisible, setModalVisible] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, a, tt] = await Promise.all([getMyCoverage(), getMyAbsences(), getMyTimetable()])
      setRows(c.rows); setAbsences(a.absences); setSlots(tt.slots); setPeriodsMissed(a.periodsMissed); setPeriodMinutes(a.periodMinutes)
    } catch { /* keep last-known data on transient failure */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = () => { setRefreshing(true); load() }

  // Only this week's days you actually teach on — no free-text date entry, so you can
  // never file an absence against a day with no class in the first place.
  const weekChoices = thisWeekDates().filter((w) => slots.some((s) => s.dayOfWeek === w.dayOfWeek && s.subjectId))

  const openModal = () => {
    const today = todayStr()
    const initial = weekChoices.find((c) => c.date === today)?.date ?? weekChoices[0]?.date ?? ''
    setDate(initial); setWholeDay(true); setSelectedSlotIds([])
    setModalVisible(true)
  }

  const daySlots = DATE_RE.test(date) ? slots.filter((s) => s.dayOfWeek === dayOfWeekFor(date) && s.subjectId) : []
  const reportableSlots = daySlots.filter((s) => !slotHasPassed(date, s.endTime))

  const handleSubmit = async () => {
    if (!DATE_RE.test(date)) {
      Alert.alert(t('Validation'), t('Select a day'))
      return
    }
    if (!wholeDay && selectedSlotIds.length === 0) {
      Alert.alert(t('Validation'), t('Select the whole day or at least one period'))
      return
    }
    setSaving(true)
    try {
      await reportAbsence({ date, wholeDay, timetableSlotIds: wholeDay ? undefined : selectedSlotIds })
      setModalVisible(false)
      load()
      Alert.alert(t('Saved'), t('Absence recorded'))
    } catch (err: any) {
      Alert.alert(t('Error'), err.response?.data?.message || t('Failed to record absence'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAbsence = (id: string) => {
    Alert.alert(t('Remove absence?'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Remove'), style: 'destructive', onPress: async () => {
          try { await deleteAbsence(id); load() } catch { Alert.alert(t('Error'), t('Failed to remove absence')) }
        },
      },
    ])
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {rows.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="time-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('No required-hours target has been set for any of your subjects yet.')}</Text>
          </View>
        ) : rows.map((r) => (
          <View key={`${r.teacherId}-${r.subjectId}`} style={styles.card}>
            <Text style={styles.subject}>{r.subjectName}</Text>
            <Text style={styles.meta}>{r.classLevel}{r.term ? ` · ${r.term}` : ''}</Text>
            <View style={styles.statsRow}>
              <View><Text style={styles.statLabel}>{t('Required')}</Text><Text style={styles.statValue}>{r.requiredHours != null ? formatHours(r.requiredHours) : '—'}</Text></View>
              <View><Text style={styles.statLabel}>{t('Taught so far')}</Text><Text style={styles.statValue}>{formatHours(r.taughtHours)}</Text></View>
              <View><Text style={styles.statLabel}>{r.isFinal ? t('Final') : t('Projected')}</Text><Text style={styles.statValue}>{formatHours(r.projectedFinalHours)}</Text></View>
            </View>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
              <Text style={styles.badgeText}>{t(r.status)}</Text>
            </View>
          </View>
        ))}

        {/* Scoped to the current period server-side (semester for university, academic
            year for primary/secondary) — once that period ends this resets to a fresh
            record, even though nothing is ever deleted; older absences just age out of
            this default view. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: periodsMissed > 0 ? '#fed7aa' : colors.bgSecondary, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="calendar-clear-outline" size={18} color={periodsMissed > 0 ? '#c2410c' : colors.textMuted} />
          </View>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{periodsMissed}</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
              {unit(periodsMissed)} {isUniversity ? t('this semester') : t('this academic year')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('Absences reported')}</Text>
        {absences.length === 0 ? (
          <Text style={styles.emptyText}>{t('No absences reported.')}</Text>
        ) : (
          <>
            {/* Past ABSENCES_PREVIEW_LIMIT, keep the card short and hand off to a
                dedicated history screen instead of letting this list grow forever. */}
            {absences.slice(0, ABSENCES_PREVIEW_LIMIT).map((a) => {
              // Once the period's happened, only an admin can remove it (they may want to
              // mark the teacher present after all); once an admin has reviewed it in a PRIOR
              // visit to their list, it's locked for everyone.
              const locked = a.hourHasPassed || a.seenByAdmin
              return (
                <View key={a.id} style={styles.absenceRow}>
                  <Text style={styles.absenceText}>
                    {a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}
                    {a.seenByAdmin ? ` (${t('reviewed')})` : ''}{'\n'}
                    <Text style={{ color: colors.textSecondary }}>{a.subjectName} · {a.classLevel}</Text>
                  </Text>
                  {locked ? (
                    <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                  ) : (
                    <TouchableOpacity onPress={() => handleDeleteAbsence(a.id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
            {absences.length > ABSENCES_PREVIEW_LIMIT && (
              <TouchableOpacity style={styles.seeAllRow} onPress={() => router.push('/absences' as any)}>
                <Text style={styles.seeAllText}>{t('See all')} ({absences.length})</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.85}>
        <Ionicons name="calendar-clear-outline" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Report Absence')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('Date')} <Text style={styles.required}>*</Text></Text>
            {weekChoices.length === 0 ? (
              <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t('No periods on your timetable this week.')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateChipRow}>
                {weekChoices.map((c) => {
                  const active = c.date === date
                  const isToday = c.date === todayStr()
                  const dayNum = Number(c.date.slice(8, 10))
                  return (
                    <TouchableOpacity
                      key={c.date}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                      onPress={() => { setDate(c.date); setSelectedSlotIds([]) }}
                    >
                      <Text style={[styles.dateChipDay, active && styles.dateChipDayActive]}>
                        {isToday ? t('Today') : t(dayShort(c.dayOfWeek))}
                      </Text>
                      <Text style={[styles.dateChipNum, active && styles.dateChipNumActive]}>{dayNum}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}

            {DATE_RE.test(date) && (
              daySlots.length === 0 ? (
                <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t('No periods on your timetable for this day.')}</Text>
              ) : reportableSlots.length === 0 ? (
                <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t('All periods for this day have already passed — ask an admin if this needs correcting.')}</Text>
              ) : (
                <ScrollView style={{ maxHeight: 260 }}>
                  <Checkbox checked={wholeDay} onToggle={() => setWholeDay((v) => !v)} label={t('Absent the whole day')} colors={colors} />
                  {/* Always visible, not just once "whole day" is unchecked — while it's
                      checked these just reflect that every period is covered (shown
                      checked + disabled) rather than disappearing entirely. Periods that
                      have already happened are locked out regardless of wholeDay. */}
                  {daySlots.map((s) => {
                    const passed = slotHasPassed(date, s.endTime)
                    return (
                      <Checkbox
                        key={s.id}
                        checked={passed ? false : (wholeDay || selectedSlotIds.includes(s.id))}
                        disabled={wholeDay || passed}
                        onToggle={() => setSelectedSlotIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                        label={`${s.startTime}–${s.endTime} · ${s.subjectName} (${s.classLevel})${passed ? ` — ${t('already passed')}` : ''}`}
                        colors={colors}
                      />
                    )
                  })}
                </ScrollView>
              )
            )}

            <TouchableOpacity
              style={[styles.createBtn, (saving || !DATE_RE.test(date) || reportableSlots.length === 0) && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || !DATE_RE.test(date) || reportableSlots.length === 0}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createBtnText}>{t('Report Absence')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// A PANEL, deliberately not its own <Modal>. iOS cannot reliably present a second modal
// on top of an already-presented one — the picker simply never appeared, so an admin
// could never choose a teacher and the whole Report Absence flow was unusable. It's now
// rendered INSIDE the report modal (absolutely filling it) instead of stacking a second.
function TeacherPickerPanel({ teachers, onSelect, onClose, colors, t }: {
  teachers: Teacher[]; onSelect: (teacher: Teacher) => void; onClose: () => void; colors: Colors; t: (s: string) => string
}) {
  const styles = makeStyles(colors)
  const [search, setSearch] = useState('')
  const filtered = teachers.filter((tch) => !search.trim() || tch.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }]}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t('Select teacher')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('Search teacher...')}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <FlatList
            // Deliberately NOT flex: 1. `pickerSheet` is content-sized (maxHeight only,
            // no fixed height), and in Yoga a flex:1 child of an auto-height parent
            // resolves to ZERO height — which collapsed this list and left the admin
            // staring at an empty "Select teacher" sheet. maxHeight caps it instead, so
            // it grows with its content and scrolls past that cap.
            style={{ maxHeight: 380 }}
            data={filtered}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('No teachers found')}</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.teacherItem} onPress={() => onSelect(item)}>
                <View style={styles.teacherAvatar}><Text style={styles.teacherAvatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <Text style={styles.teacherNameText}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          />
      </View>
    </View>
  )
}

interface DrillTarget {
  teacherId: string
  teacherName: string
  // null = show every absence for this teacher, not scoped to one course (the "By
  // Teacher" view) — set when opened from the per-course coverage cards ("By Course").
  subjectName: string | null
  classLevel: string | null
}

// Admin's counterpart to TeacherAttendanceScreen above — did not exist on mobile at all
// before (the tab was hidden for admins, coverage was web-only). Same coverage/absence
// data as the web admin page: a per-teacher-per-course list, drill in to see and manage
// that course's reported absences, plus reporting one on a teacher's behalf. Unlike the
// teacher's own flow, there is deliberately NO elapsed-hour restriction here — an admin
// may be backfilling a record after the fact.
function AdminAttendanceScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'

  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])

  // By Course (existing coverage cards, only courses with an hours target) vs By Teacher
  // (every teacher, every absence — a course with no target set is otherwise invisible).
  const [viewMode, setViewMode] = useState<'course' | 'teacher'>('course')
  const [teacherSearch, setTeacherSearch] = useState('')
  // Value stored is PERIODS missed per teacher; periodMinutes null → numbers are event
  // counts, labelled "absences" rather than "periods".
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number>>({})
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  const [hoursTotals, setHoursTotals] = useState<Record<string, TeacherHoursTotal>>({})
  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period') : t('periods')) : (n === 1 ? t('absence') : t('absences'))

  const [drillDown, setDrillDown] = useState<DrillTarget | null>(null)
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [absencesLoading, setAbsencesLoading] = useState(false)

  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [teacherPickerVisible, setTeacherPickerVisible] = useState(false)
  const [reportTeacher, setReportTeacher] = useState<Teacher | null>(null)
  const [teacherSlots, setTeacherSlots] = useState<MyTimetableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getCoverage().then((d) => setRows(d.rows)).catch(() => {}).finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  const loadCounts = useCallback(() => {
    getAbsenceCounts()
      .then((d) => { setAbsenceCounts(Object.fromEntries(d.counts.map((c) => [c.teacherId, c.periods]))); setPeriodMinutes(d.periodMinutes) })
      .catch(() => {})
  }, [])

  const loadHoursTotals = useCallback(() => {
    getTeacherHoursTotals()
      .then((d) => setHoursTotals(Object.fromEntries(d.totals.map((tot) => [tot.teacherId, tot]))))
      .catch(() => {})
  }, [])

  useFocusEffect(useCallback(() => { load(); loadCounts(); loadHoursTotals() }, [load, loadCounts, loadHoursTotals]))
  useEffect(() => { getTeachers().then((d) => setTeachers(d.teachers)).catch(() => {}) }, [])

  const onRefresh = () => { setRefreshing(true); load(); loadCounts() }

  const teacherRows = teachers
    .map((tch) => ({ ...tch, count: absenceCounts[tch.id] ?? 0 }))
    .filter((tch) => !teacherSearch.trim() || tch.name.toLowerCase().includes(teacherSearch.toLowerCase()))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.teacherName.toLowerCase().includes(q) || r.subjectName.toLowerCase().includes(q) || r.classLevel.toLowerCase().includes(q)
  })

  const openDrillDown = (row: CoverageRow) => {
    setDrillDown({ teacherId: row.teacherId, teacherName: row.teacherName, subjectName: row.subjectName, classLevel: row.classLevel })
    setAbsencesLoading(true)
    getTeacherAbsences(row.teacherId)
      .then((d) => setAbsences(d.absences.filter((a) => a.subjectName === row.subjectName && a.classLevel === row.classLevel)))
      .catch(() => {})
      .finally(() => setAbsencesLoading(false))
  }

  // "By Teacher" — every absence for this teacher, any course, targeted or not.
  const openTeacherDrillDown = (teacherId: string, teacherName: string) => {
    setDrillDown({ teacherId, teacherName, subjectName: null, classLevel: null })
    setAbsencesLoading(true)
    getTeacherAbsences(teacherId)
      .then((d) => setAbsences(d.absences))
      .catch(() => {})
      .finally(() => setAbsencesLoading(false))
  }

  const handleDeleteAbsence = (id: string) => {
    Alert.alert(t('Remove absence?'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Remove'), style: 'destructive', onPress: async () => {
          try {
            await deleteAbsence(id)
            setAbsences((prev) => prev.filter((a) => a.id !== id))
            // The hour this absence was subtracting goes straight back into taughtHours/
            // projectedFinalHours server-side (computed fresh every fetch, nothing
            // cached) — refetch here so that's visible immediately, not just next load.
            load()
            loadCounts()
          } catch {
            Alert.alert(t('Error'), t('Failed to remove absence'))
          }
        },
      },
    ])
  }

  const openReportModal = () => {
    setReportTeacher(null); setTeacherSlots([]); setDate(''); setWholeDay(true); setSelectedSlotIds([])
    setReportModalVisible(true)
  }

  const onPickTeacher = (teacher: Teacher) => {
    setReportTeacher(teacher); setDate(''); setSelectedSlotIds([])
    setTeacherPickerVisible(false)
    setSlotsLoading(true)
    getTeacherTimetable(teacher.id).then((d) => setTeacherSlots(d.slots)).catch(() => setTeacherSlots([])).finally(() => setSlotsLoading(false))
  }

  // Same "this week, days they actually teach" restriction as the teacher's own flow —
  // just against the SELECTED teacher's timetable rather than the admin's own.
  const weekChoices = thisWeekDates().filter((w) => teacherSlots.some((s) => s.dayOfWeek === w.dayOfWeek && s.subjectId))
  const daySlots = DATE_RE.test(date) ? teacherSlots.filter((s) => s.dayOfWeek === dayOfWeekFor(date) && s.subjectId) : []
  // An absence can only be reported for a period that hasn't ENDED yet — the same rule
  // now applies to admins as to teachers (the API enforces it either way), so the picker
  // has to grey out elapsed periods rather than offer them and then fail on submit.
  const reportableSlots = daySlots.filter((s) => !slotHasPassed(date, s.endTime))

  const handleSubmit = async () => {
    if (!reportTeacher || !DATE_RE.test(date)) {
      Alert.alert(t('Validation'), t('Select a teacher and a day'))
      return
    }
    if (!wholeDay && selectedSlotIds.length === 0) {
      Alert.alert(t('Validation'), t('Select the whole day or at least one period'))
      return
    }
    setSaving(true)
    try {
      await reportAbsence({ teacherId: reportTeacher.id, date, wholeDay, timetableSlotIds: wholeDay ? undefined : selectedSlotIds })
      setReportModalVisible(false)
      load()
      loadCounts()
      if (drillDown && drillDown.teacherId === reportTeacher.id) {
        // Refresh whichever drill-down was open — course-scoped or the full teacher list.
        if (drillDown.subjectName) {
          const row = rows.find((r) => r.teacherId === drillDown.teacherId && r.subjectName === drillDown.subjectName && r.classLevel === drillDown.classLevel)
          if (row) openDrillDown(row)
        } else {
          openTeacherDrillDown(drillDown.teacherId, drillDown.teacherName)
        }
      }
      Alert.alert(t('Saved'), t('Absence recorded'))
    } catch (err: any) {
      Alert.alert(t('Error'), err.response?.data?.message || t('Failed to record absence'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <View style={styles.container}>
      {/* By Course = existing coverage cards, hours-target tracking, courses without a
          target never appear here. By Teacher = every teacher, every absence, no matter
          what course or whether it has an hours target — a separate concern from hours
          tracking, so it's a distinct view rather than bolted onto the cards below. */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
        <TouchableOpacity
          onPress={() => setViewMode('course')}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: viewMode === 'course' ? '#F03E2F' : colors.card, borderWidth: 1, borderColor: viewMode === 'course' ? '#F03E2F' : colors.border }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: viewMode === 'course' ? '#fff' : colors.textSecondary }}>{t('By Course')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('teacher')}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: viewMode === 'teacher' ? '#F03E2F' : colors.card, borderWidth: 1, borderColor: viewMode === 'teacher' ? '#F03E2F' : colors.border }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: viewMode === 'teacher' ? '#fff' : colors.textSecondary }}>{t('By Teacher')}</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'teacher' ? (
        <>
          <Text style={[styles.absenceHint, { paddingHorizontal: 16, paddingTop: 10 }]}>
            {isUniversity
              ? t('Counts are for the current semester — next semester starts a fresh record.')
              : t('Counts are for the current academic year — next year starts a fresh record.')}
          </Text>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('Search teacher...')}
                placeholderTextColor={colors.textMuted}
                value={teacherSearch}
                onChangeText={setTeacherSearch}
              />
            </View>
          </View>
          <FlatList
            // flex: 1 keeps the search box + hint above from being squeezed once the
            // list fills — without it the list sizes to full content height. Same bug
            // class as the report-cards term chips.
            style={{ flex: 1 }}
            data={teacherRows}
            keyExtractor={(tch) => tch.id}
            contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>{t('No teachers found.')}</Text>
              </View>
            }
            renderItem={({ item: tch }) => {
              const totals = hoursTotals[tch.id]
              return (
                <TouchableOpacity
                  style={[styles.coverageCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => openTeacherDrillDown(tch.id, tch.name)}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={styles.teacherNameText}>{tch.name}</Text>
                    {!!totals && totals.scheduledHours > 0 && (
                      <Text style={styles.absenceHint}>
                        {formatHours(totals.taughtHours)} {t('hours taught')}{!totals.isFinal ? ` (${t('so far')})` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.badge, { backgroundColor: tch.count > 0 ? '#fed7aa' : '#f3f4f6' }]}>
                    <Text style={[styles.badgeText, { color: tch.count > 0 ? '#c2410c' : '#6b7280' }]}>
                      {tch.count} {unit(tch.count)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            }}
          />
        </>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('Search teacher, subject or class...')}
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>

          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(r) => `${r.teacherId}-${r.subjectId}`}
            contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="time-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>{t('No subjects have a required-hours target set yet.')}</Text>
              </View>
            }
            renderItem={({ item: r }) => (
              <TouchableOpacity style={styles.coverageCard} onPress={() => openDrillDown(r)} activeOpacity={0.7}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.teacherNameText}>{r.teacherName}</Text>
                  {r.periodsMissed > 0 && (
                    <View style={{ backgroundColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#c2410c' }}>{r.periodsMissed}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.subject}>{r.subjectName}</Text>
                <Text style={styles.meta}>{r.classLevel}{r.term ? ` · ${r.term}` : ''}</Text>
                <View style={styles.statsRow}>
                  <View><Text style={styles.statLabel}>{t('Required')}</Text><Text style={styles.statValue}>{r.requiredHours != null ? formatHours(r.requiredHours) : '—'}</Text></View>
                  <View><Text style={styles.statLabel}>{t('Taught so far')}</Text><Text style={styles.statValue}>{formatHours(r.taughtHours)}</Text></View>
                  <View><Text style={styles.statLabel}>{r.isFinal ? t('Final') : t('Projected')}</Text><Text style={styles.statValue}>{formatHours(r.projectedFinalHours)}</Text></View>
                </View>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
                  <Text style={styles.badgeText}>{t(r.status)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      <TouchableOpacity style={styles.fab} onPress={openReportModal} activeOpacity={0.85}>
        <Ionicons name="calendar-clear-outline" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Drill-down: one teacher/subject/class's absences */}
      <Modal visible={!!drillDown} transparent animationType="slide" onRequestClose={() => setDrillDown(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{drillDown?.teacherName}</Text>
                <Text style={styles.meta}>
                  {drillDown?.subjectName ? `${drillDown.subjectName} · ${drillDown.classLevel}` : `${absences.reduce((s, a) => s + (a.periods ?? 1), 0)} ${unit(absences.reduce((s, a) => s + (a.periods ?? 1), 0))} ${t('missed, all courses')}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDrillDown(null)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, { marginBottom: 8 }]}>{t('Absences logged')}</Text>
            {absencesLoading ? (
              <ActivityIndicator color="#F03E2F" />
            ) : absences.length === 0 ? (
              <Text style={styles.emptyText}>{drillDown?.subjectName ? t('No absences reported for this course.') : t('No absences reported for this teacher.')}</Text>
            ) : (
              // seenByAdmin only locks a TEACHER out of retracting their own report — an
              // admin can remove one here regardless, right up until the period it was
              // reported for has actually ENDED (hourHasPassed) — after that it's final
              // for everyone, since there's no more chance the teacher shows up.
              <ScrollView style={{ maxHeight: 320 }}>
                {absences.map((a) => (
                  <View key={a.id} style={styles.absenceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.absenceText}>{a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</Text>
                      {/* Only shown in the unscoped "By Teacher" view — the "By Course"
                          view already scopes the whole list to one course. */}
                      {!drillDown?.subjectName && (a.subjectName || a.classLevel) && (
                        <Text style={styles.absenceHint}>{a.subjectName} · {a.classLevel}</Text>
                      )}
                      {a.seenByAdmin && <Text style={styles.absenceHint}>{t('reviewed')}</Text>}
                    </View>
                    {a.hourHasPassed ? (
                      <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                    ) : (
                      <TouchableOpacity onPress={() => handleDeleteAbsence(a.id)}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Report absence on a teacher's behalf — no elapsed-hour restriction (admin override) */}
      <Modal visible={reportModalVisible} transparent animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Report Absence')}</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('Teacher')} <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity style={styles.input} onPress={() => setTeacherPickerVisible(true)}>
              <Text style={{ color: reportTeacher ? colors.text : '#9ca3af' }}>
                {reportTeacher?.name ?? t('Select teacher…')}
              </Text>
            </TouchableOpacity>

            {reportTeacher && (
              slotsLoading ? (
                <ActivityIndicator color="#F03E2F" />
              ) : teacherSlots.length === 0 ? (
                // Distinct from "none THIS week" below — catches the exact confusion
                // that motivated this: a teacher with NO timetable at all silently has
                // nothing to match on any date, and the report never actually goes
                // through, with no obvious next step for the admin.
                <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#92400e' }}>
                    {t("This teacher has no timetable set up yet, so an absence can't be recorded for them. Set up their timetable first, then come back here.")}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>{t('Date')} <Text style={styles.required}>*</Text></Text>
                  {weekChoices.length === 0 ? (
                    <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t("No periods on this teacher's timetable this week.")}</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateChipRow}>
                      {weekChoices.map((c) => {
                        const active = c.date === date
                        const isToday = c.date === todayStr()
                        const dayNum = Number(c.date.slice(8, 10))
                        return (
                          <TouchableOpacity
                            key={c.date}
                            style={[styles.dateChip, active && styles.dateChipActive]}
                            onPress={() => { setDate(c.date); setSelectedSlotIds([]) }}
                          >
                            <Text style={[styles.dateChipDay, active && styles.dateChipDayActive]}>
                              {isToday ? t('Today') : t(dayShort(c.dayOfWeek))}
                            </Text>
                            <Text style={[styles.dateChipNum, active && styles.dateChipNumActive]}>{dayNum}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  )}

                  {DATE_RE.test(date) && (
                    daySlots.length === 0 ? (
                      <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t("No periods on this teacher's timetable for this day.")}</Text>
                    ) : reportableSlots.length === 0 ? (
                      <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t('All periods for this day have already passed and can no longer be reported.')}</Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 220 }}>
                        <Checkbox checked={wholeDay} onToggle={() => setWholeDay((v) => !v)} label={t('Absent the whole day')} colors={colors} />
                        {daySlots.map((s) => {
                          // Elapsed periods stay VISIBLE but locked, so it's clear they
                          // exist and why they can't be picked, rather than silently
                          // vanishing from the day's list.
                          const passed = slotHasPassed(date, s.endTime)
                          return (
                            <Checkbox
                              key={s.id}
                              checked={passed ? false : (wholeDay || selectedSlotIds.includes(s.id))}
                              disabled={wholeDay || passed}
                              onToggle={() => setSelectedSlotIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                              label={`${s.startTime}–${s.endTime} · ${s.subjectName} (${s.classLevel})${passed ? ` — ${t('already passed')}` : ''}`}
                              colors={colors}
                            />
                          )
                        })}
                      </ScrollView>
                    )
                  )}
                </>
              )
            )}

            <TouchableOpacity
              style={[styles.createBtn, (saving || !reportTeacher || !DATE_RE.test(date) || reportableSlots.length === 0) && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || !reportTeacher || !DATE_RE.test(date) || reportableSlots.length === 0}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createBtnText}>{t('Report Absence')}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Rendered INSIDE this modal, not as a second one — iOS won't present a modal
            over an already-presented modal, which is why the picker never showed. */}
        {teacherPickerVisible && (
          <TeacherPickerPanel
            teachers={teachers}
            onSelect={onPickTeacher}
            onClose={() => setTeacherPickerVisible(false)}
            colors={colors}
            t={t}
          />
        )}
      </Modal>
    </View>
  )
}

export default function TeachingHoursScreen() {
  const { user } = useAuthStore()
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')
  return isAdmin ? <AdminAttendanceScreen /> : <TeacherAttendanceScreen />
}
