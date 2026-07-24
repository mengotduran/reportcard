import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, Modal, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyCoverage, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { getMyTimetable, MyTimetableSlot } from '@/lib/api/timetable'
import { getMyAbsences, reportAbsence, deleteAbsence, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

function dayOfWeekFor(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return ['SUNDAY', ...DAY_ORDER.slice(0, 6)][jsDay]
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
})

function Checkbox({ checked, onToggle, label, colors }: { checked: boolean; onToggle: () => void; label: string; colors: Colors }) {
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onToggle}>
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function TeachingHoursScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'

  const [rows, setRows] = useState<CoverageRow[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, a, tt] = await Promise.all([getMyCoverage(), getMyAbsences(), getMyTimetable()])
      setRows(c.rows); setAbsences(a.absences); setSlots(tt.slots)
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
              <View><Text style={styles.statLabel}>{t('Required')}</Text><Text style={styles.statValue}>{r.requiredHours}</Text></View>
              <View><Text style={styles.statLabel}>{t('Taught so far')}</Text><Text style={styles.statValue}>{r.taughtHours.toFixed(1)}</Text></View>
              <View><Text style={styles.statLabel}>{r.isFinal ? t('Final') : t('Projected')}</Text><Text style={styles.statValue}>{r.projectedFinalHours.toFixed(1)}</Text></View>
            </View>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
              <Text style={styles.badgeText}>{t(r.status)}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>{t('Absences reported')}</Text>
        {absences.length === 0 ? (
          <Text style={styles.emptyText}>{t('No absences reported.')}</Text>
        ) : absences.map((a) => (
          <View key={a.id} style={styles.absenceRow}>
            <Text style={styles.absenceText}>
              {a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}{'\n'}
              <Text style={{ color: colors.textSecondary }}>{a.subjectName} · {a.classLevel}</Text>
            </Text>
            <TouchableOpacity onPress={() => handleDeleteAbsence(a.id)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
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
              ) : (
                <ScrollView style={{ maxHeight: 260 }}>
                  <Checkbox checked={wholeDay} onToggle={() => setWholeDay((v) => !v)} label={t('Absent the whole day')} colors={colors} />
                  {!wholeDay && daySlots.map((s) => (
                    <Checkbox
                      key={s.id}
                      checked={selectedSlotIds.includes(s.id)}
                      onToggle={() => setSelectedSlotIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                      label={`${s.startTime}–${s.endTime} · ${s.subjectName} (${s.classLevel})`}
                      colors={colors}
                    />
                  ))}
                </ScrollView>
              )
            )}

            <TouchableOpacity
              style={[styles.createBtn, (saving || !DATE_RE.test(date) || daySlots.length === 0) && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || !DATE_RE.test(date) || daySlots.length === 0}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createBtnText}>{t('Report Absence')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
