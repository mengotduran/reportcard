import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, Modal, Alert, FlatList, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getMyCoverage, getCoverage, getTeacherHoursTotals, CoverageRow, CoverageStatus, TeacherHoursTotal, UnassignedTarget } from '@/lib/api/coverage'
import { getMyTimetable, getTeacherTimetable, MyTimetableSlot } from '@/lib/api/timetable'
import { getMyAbsences, getTeacherAbsences, getAbsenceCounts, reportAbsence, deleteAbsence, TeacherAbsence, AbsenceDay } from '@/lib/api/teacherAbsence'
import { getTeachers, Teacher } from '@/lib/api/teachers'
import { formatHours } from '@/lib/formatHours'
import { onRealtime } from '@/lib/socket'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { hasPassed } from '@/lib/schoolTime'
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

// Same cutoff the API applies, so the UI greys a period out up front instead of only
// finding out after a rejected request. See lib/schoolTime.
/**
 * Past the point where this slot can still be REPORTED absent, which depends on who is
 * reporting (mirrors createAbsence):
 *   teacher  the period's START — once their class has begun it is no longer theirs to file
 *   admin    the period's END   — they are often recording after the fact
 * Kept in one place so the greyed-out checkboxes can never offer something the API refuses.
 */
const pastReportCutoff = (dateStr: string, slot: { startTime: string; endTime: string }, asAdmin: boolean) =>
  hasPassed(dateStr, asAdmin ? slot.endTime : slot.startTime)

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = () => toDateStr(new Date())
const dayShort = (d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase()

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthDay = (dateStr: string) => `${MONTH_SHORT[Number(dateStr.slice(5, 7)) - 1]} ${Number(dateStr.slice(8, 10))}`
// Both sides are YYYY-MM-DD, which Date.parse reads as UTC midnight — no local-timezone
// drift, so the difference is always a whole number of days.
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** One calendar month on, clamped so 31 Jan gives 28/29 Feb rather than rolling into March. */
function oneMonthAhead(from: Date): Date {
  const d = new Date(from)
  const dayOfMonth = d.getDate()
  d.setMonth(d.getMonth() + 1)
  if (d.getDate() !== dayOfMonth) d.setDate(0) // overflowed into the next month, step back to its last day
  return d
}

/**
 * Every date a teacher can book an absence for: from TODAY up to a month ahead.
 *
 * Starts at today rather than Monday because a period that has already ENDED can never be
 * reported by anyone (the API rejects it outright), so earlier days this week would only
 * ever render as dead, unselectable chips.
 *
 * `maxDate` is the end of the current record (semester for a university, academic year for
 * primary/secondary) and pulls the far edge in when it lands sooner than a month out.
 * Booking past it would create an absence counted against the NEXT semester/year, which
 * would disappear from the teacher's own list the instant it was saved.
 */
function bookingWindowDates(maxDate?: string | null): { date: string; dayOfWeek: string }[] {
  const start = new Date()
  const monthOut = toDateStr(oneMonthAhead(start))
  const end = maxDate && maxDate < monthOut ? maxDate : monthOut
  const out: { date: string; dayOfWeek: string }[] = []
  const cursor = new Date(start)
  for (let dateStr = toDateStr(cursor); dateStr <= end; dateStr = toDateStr(cursor)) {
    out.push({ date: dateStr, dayOfWeek: dayOfWeekFor(dateStr) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** Monday of the week `dateStr` falls in. Groups the chips so a bare day number is never
 *  ambiguous once the window runs weeks out. */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const jsDay = dt.getDay() // 0=Sun..6=Sat
  dt.setDate(dt.getDate() + (jsDay === 0 ? -6 : 1 - jsDay))
  return toDateStr(dt)
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return toDateStr(dt)
}

// Quick spans for booking a stretch of leave in one go, instead of ticking twenty days by
// hand. There is deliberately no "one day" preset: a single day IS the unticked default,
// and adding one would tick the whole day for you, which is exactly what shouldn't happen
// before you ask for it.
const RANGE_PRESETS = [
  { key: 'WEEK', label: '1 week' },
  { key: 'TWO_WEEKS', label: '2 weeks' },
  { key: 'THREE_WEEKS', label: '3 weeks' },
  { key: 'MONTH', label: '1 month' },
] as const
type RangePresetKey = (typeof RANGE_PRESETS)[number]['key']

/** Last date a preset covers, counting from (and including) `start`. */
function spanEndFor(start: string, preset: RangePresetKey): string {
  if (preset === 'WEEK') return addDays(start, 6)
  if (preset === 'TWO_WEEKS') return addDays(start, 13)
  if (preset === 'THREE_WEEKS') return addDays(start, 20)
  const [y, m, d] = start.split('-').map(Number)
  return toDateStr(oneMonthAhead(new Date(y, m - 1, d)))
}

/** Heading for a week group: relative for the two nearest weeks, then a concrete date,
 *  which stays unambiguous however far out the window reaches. */
function weekGroupLabel(weekKey: string, t: (s: string) => string): string {
  const offset = daysBetween(weekStartOf(todayStr()), weekKey)
  if (offset <= 0) return t('This week')
  if (offset === 7) return t('Next week')
  return `${t('Week of')} ${monthDay(weekKey)}`
}

/** The booking window split into weeks, in order, each keyed by its Monday. */
function groupByWeek(choices: { date: string; dayOfWeek: string }[]) {
  const groups: { key: string; days: { date: string; dayOfWeek: string }[] }[] = []
  for (const c of choices) {
    const key = weekStartOf(c.date)
    const existing = groups.find((g) => g.key === key)
    if (existing) existing.days.push(c)
    else groups.push({ key, days: [c] })
  }
  return groups
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
  dateChipRow: { marginBottom: 16 },
  // Weeks are laid out as labelled groups inside the one horizontal scroller, so a chip
  // reading "11" is always anchored to a week even a month out.
  dateChipRowContent: { flexDirection: 'row', gap: 18, alignItems: 'flex-start', paddingRight: 4 },
  weekGroup: { gap: 6 },
  weekGroupLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  weekGroupDays: { flexDirection: 'row', gap: 8 },
  dateChip: {
    alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary, minWidth: 58,
  },
  dateChipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  // "Has something selected" is a separate state from "currently being edited" — across a
  // month of chips you need to see what you've already ticked without visiting each day.
  dateChipMarked: { borderColor: '#F03E2F' },
  dateChipDay: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  dateChipDayActive: { color: 'rgba(255,255,255,0.85)' },
  dateChipNum: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 1 },
  dateChipNumActive: { color: '#fff' },
  dateChipDotSlot: { height: 9, justifyContent: 'center' },
  dateChipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F03E2F' },
  dateChipDotActive: { backgroundColor: '#fff' },
  presetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  presetIntro: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  presetAnchor: { fontWeight: '700', color: colors.text },
  presetHint: { fontSize: 11, color: colors.textMuted, marginBottom: 12, marginTop: -2 },
  presetChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  presetChipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  presetChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  presetChipTextActive: { color: '#fff' },
  clearText: { fontSize: 12, fontWeight: '600', color: '#F03E2F' },
  summaryText: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
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

/** What's selected for ONE day. Whole-day and specific periods are alternatives, but the
 *  ticked periods survive toggling whole day off and on again. */
type DaySelection = { wholeDay: boolean; slotIds: string[] }
/** Keyed by date. A date absent from the map has nothing selected. */
type Selections = Record<string, DaySelection>

/**
 * Date + period picker for a report that may span many days.
 *
 * Selection is held PER DATE, which is the whole point: moving to another day and back
 * restores exactly what was ticked, and ticking "whole day" applies to that day alone
 * rather than every day at once. Nothing is ticked until the teacher ticks it.
 *
 * Shared by the teacher's own flow and the admin's report-on-behalf so the two can't drift
 * apart again — they had already grown two copies of the old single-day chip row.
 */
function AbsenceDayPicker({
  slots, reportedPeriods, periodMinutes, periodEnd, selections, onChange, date, onDateChange, colors, t, noDaysMessage, asAdmin = false,
}: {
  slots: MyTimetableSlot[]
  /** `${date}|${slotId}` for periods already on record, which can't be reported twice. */
  reportedPeriods: Map<string, number>
  /** Slot length divider, so a double period knows it is worth two. */
  periodMinutes: number | null
  periodEnd: string | null
  selections: Selections
  onChange: (next: Selections) => void
  date: string
  onDateChange: (d: string) => void
  colors: Colors
  t: (s: string) => string
  noDaysMessage: string
  /** An admin may still file for a period already in progress; a teacher may not. */
  asAdmin?: boolean
}) {
  const styles = makeStyles(colors)
  // Which preset was applied, and from WHICH day. The anchor is part of it: "2 weeks" only
  // describes the current selection while you're still standing on the day it counted from,
  // so moving to another day drops the highlight and tapping it again re-runs it from there.
  const [applied, setApplied] = useState<{ preset: RangePresetKey; anchor: string } | null>(null)

  const dayChoices = bookingWindowDates(periodEnd).filter((w) => slots.some((s) => s.dayOfWeek === w.dayOfWeek && s.subjectId))
  const weekGroups = groupByWeek(dayChoices)

  const daySlotsFor = (d: string) => slots.filter((s) => s.dayOfWeek === dayOfWeekFor(d) && s.subjectId)
  // How many periods a slot spans — a 100-minute class on a 50-minute grid is two.
  const periodCountOf = (s: MyTimetableSlot) => {
    if (!periodMinutes || periodMinutes <= 0) return 1
    const [sh, sm] = s.startTime.split(':').map(Number)
    const [eh, em] = s.endTime.split(':').map(Number)
    return Math.max(1, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / periodMinutes))
  }
  // Fully reported only when EVERY period of the slot is on record. A double period whose
  // second period an admin cancelled is partly free again, and must stay reportable.
  const isFullyReported = (d: string, s: MyTimetableSlot) =>
    (reportedPeriods.get(`${d}|${s.id}`) ?? 0) >= periodCountOf(s)
  // What can still be reported on a given day: not already elapsed, not already on record.
  const bookableSlotsFor = (d: string) =>
    daySlotsFor(d).filter((s) => !pastReportCutoff(d, s, asAdmin) && !isFullyReported(d, s))

  // A preset that's been manually adjusted is no longer that preset.
  useEffect(() => {
    if (Object.keys(selections).length === 0) setApplied(null)
  }, [selections])

  const setDay = (d: string, next: DaySelection) => {
    const copy = { ...selections }
    if (!next.wholeDay && next.slotIds.length === 0) delete copy[d]
    else copy[d] = next
    setApplied(null)
    onChange(copy)
  }

  // Ticks the whole day for every teaching day from the selected chip through the end of
  // the span. REPLACES the selection rather than adding to it, so tapping 1 week after
  // 1 month gives a week, not both.
  const applyPreset = (preset: RangePresetKey) => {
    const end = spanEndFor(date, preset)
    const next: Selections = {}
    for (const c of dayChoices) {
      if (c.date < date || c.date > end) continue
      if (bookableSlotsFor(c.date).length === 0) continue // nothing left to report that day
      next[c.date] = { wholeDay: true, slotIds: [] }
    }
    onChange(next)
    setApplied({ preset, anchor: date })
  }

  const current = selections[date] ?? { wholeDay: false, slotIds: [] }
  const daySlots = DATE_RE.test(date) ? daySlotsFor(date) : []
  const bookableToday = DATE_RE.test(date) ? bookableSlotsFor(date) : []

  const selectedDays = Object.keys(selections)
  const selectedPeriods = selectedDays.reduce((sum, d) => {
    const sel = selections[d]
    return sum + (sel.wholeDay ? bookableSlotsFor(d).length : sel.slotIds.length)
  }, 0)

  if (dayChoices.length === 0) {
    return <Text style={[styles.emptyText, { marginBottom: 12 }]}>{noDaysMessage}</Text>
  }

  return (
    <>
      {/* Names the day the span will count FROM, and changes as you tap another day. The
          anchoring always worked, but with a static label there was no way to tell that
          the start was the selected day rather than always today. */}
      <Text style={styles.presetIntro}>
        {t('Report from')}{' '}
        <Text style={styles.presetAnchor}>
          {date === todayStr() ? t('today') : `${t(dayShort(dayOfWeekFor(date)))} ${monthDay(date)}`}
        </Text>
        {' '}{t('for')}
      </Text>
      <View style={styles.presetRow}>
        {RANGE_PRESETS.map((p) => {
          const active = applied?.preset === p.key && applied.anchor === date
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.presetChip, active && styles.presetChipActive]}
              onPress={() => applyPreset(p.key)}
            >
              <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>{t(p.label)}</Text>
            </TouchableOpacity>
          )
        })}
        {selectedDays.length > 0 && (
          <TouchableOpacity onPress={() => { onChange({}); setApplied(null) }}>
            <Text style={styles.clearText}>{t('Clear')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {selectedDays.length === 0 && (
        <Text style={styles.presetHint}>{t('Tap a day below to start from it.')}</Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateChipRow}
        contentContainerStyle={styles.dateChipRowContent}
      >
        {weekGroups.map((g) => (
          <View key={g.key} style={styles.weekGroup}>
            <Text style={styles.weekGroupLabel}>{weekGroupLabel(g.key, t)}</Text>
            <View style={styles.weekGroupDays}>
              {g.days.map((c) => {
                const active = c.date === date
                const marked = !!selections[c.date]
                const isToday = c.date === todayStr()
                return (
                  <TouchableOpacity
                    key={c.date}
                    style={[styles.dateChip, marked && styles.dateChipMarked, active && styles.dateChipActive]}
                    onPress={() => onDateChange(c.date)}
                  >
                    <Text style={[styles.dateChipDay, active && styles.dateChipDayActive]}>
                      {isToday ? t('Today') : t(dayShort(c.dayOfWeek))}
                    </Text>
                    <Text style={[styles.dateChipNum, active && styles.dateChipNumActive]}>{Number(c.date.slice(8, 10))}</Text>
                    {/* Fixed-height row either way, so chips don't jump as days are ticked. */}
                    <View style={styles.dateChipDotSlot}>
                      {marked && <View style={[styles.dateChipDot, active && styles.dateChipDotActive]} />}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {selectedDays.length > 0 && (
        <Text style={styles.summaryText}>
          {selectedDays.length} {selectedDays.length === 1 ? t('day') : t('days')} · {selectedPeriods} {selectedPeriods === 1 ? t('period') : t('periods')} {t('selected')}
        </Text>
      )}

      {DATE_RE.test(date) && (
        daySlots.length === 0 ? (
          <Text style={[styles.emptyText, { marginBottom: 12 }]}>{t('No periods on the timetable for this day.')}</Text>
        ) : bookableToday.length === 0 ? (
          <Text style={[styles.emptyText, { marginBottom: 12 }]}>
            {daySlots.every((s) => isFullyReported(date, s))
              ? t('Every period for this day has already been reported.')
              : t('Every period for this day has already started. Ask an admin to record it.')}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 220 }}>
            <Checkbox
              checked={current.wholeDay}
              onToggle={() => setDay(date, { wholeDay: !current.wholeDay, slotIds: current.slotIds })}
              label={t('Absent the whole day')}
              colors={colors}
            />
            {/* Always visible, not just once "whole day" is unchecked — while it's checked
                these just reflect that every period is covered (shown checked + disabled)
                rather than disappearing entirely. Periods already elapsed or already on
                record are locked out regardless. */}
            {daySlots.map((s) => {
              const passed = pastReportCutoff(date, s, asAdmin)
              const reported = isFullyReported(date, s)
              const note = passed ? ` (${t(asAdmin ? 'already passed' : 'already started')})` : reported ? ` (${t('already reported')})` : ''
              return (
                <Checkbox
                  key={s.id}
                  checked={passed ? false : (reported || current.wholeDay || current.slotIds.includes(s.id))}
                  disabled={current.wholeDay || passed || reported}
                  onToggle={() => setDay(date, {
                    wholeDay: false,
                    slotIds: current.slotIds.includes(s.id)
                      ? current.slotIds.filter((id) => id !== s.id)
                      : [...current.slotIds, s.id],
                  })}
                  label={`${s.startTime}–${s.endTime} · ${s.subjectName} (${s.classLevel})${note}`}
                  colors={colors}
                />
              )
            })}
          </ScrollView>
        )
      )}
    </>
  )
}

/**
 * Everything selected, as the API's `days` payload.
 *
 * Specifically-picked periods that elapsed while the form was open are dropped here. The
 * server rejects a report naming an already-passed period outright (deliberately: those
 * exact periods were chosen), and a long multi-day report is easily open for long enough
 * to cross a period boundary, so filtering here keeps that from failing the whole
 * submission over one stale tick. Whole-day entries need no filtering: the server drops
 * elapsed periods from those by design.
 */
function selectionsToDays(selections: Selections, slots: MyTimetableSlot[], asAdmin = false): AbsenceDay[] {
  const slotById = new Map(slots.map((s) => [s.id, s]))
  return Object.keys(selections).sort().flatMap((date): AbsenceDay[] => {
    const sel = selections[date]
    if (sel.wholeDay) return [{ date, wholeDay: true }]
    const slotIds = sel.slotIds.filter((id) => {
      const slot = slotById.get(id)
      return slot != null && !pastReportCutoff(date, slot, asAdmin)
    })
    return slotIds.length > 0 ? [{ date, wholeDay: false, timetableSlotIds: slotIds }] : []
  })
}

/** Stable empty map, so passing "no known reported periods" doesn't rebuild every render. */
const EMPTY_REPORTED_PERIODS: Map<string, number> = new Map()

// Inline preview cap on the "Absences reported" list — past this, "See all" hands off to
// a dedicated history screen instead of letting the card grow indefinitely.
const ABSENCES_PREVIEW_LIMIT = 5

function TeacherAttendanceScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const router = useRouter()
  const { school, user } = useAuthStore()
  const graceMinutes = school?.absenceGraceMinutes ?? null
  const isUniversity = school?.type === 'UNIVERSITY'

  const [rows, setRows] = useState<CoverageRow[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [slots, setSlots] = useState<MyTimetableSlot[]>([])
  const [periodsMissed, setPeriodsMissed] = useState(0)
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  // Last day of the current semester/academic-year record — the far edge of how far ahead
  // an absence may be booked. See bookingWindowDates.
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period missed') : t('periods missed')) : (n === 1 ? t('absence') : t('absences'))

  const [modalVisible, setModalVisible] = useState(false)
  const [date, setDate] = useState('')
  // Per-date, so switching days keeps what was ticked on each. See AbsenceDayPicker.
  const [selections, setSelections] = useState<Selections>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, a, tt] = await Promise.all([getMyCoverage(), getMyAbsences(), getMyTimetable()])
      setRows(c.rows); setAbsences(a.absences); setSlots(tt.slots); setPeriodsMissed(a.periodsMissed); setPeriodMinutes(a.periodMinutes); setPeriodEnd(a.periodEnd)
      setLoadFailed(false)
    } catch {
      // Not silent: falling through would show "no required-hours target has been set",
      // blaming the school's setup for what is a connection problem.
      setLoadFailed(true)
    }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Covers the case an admin locks or removes one of these while the screen is open — the
  // delete button has to stop being offered the moment that happens, not on next focus.
  useEffect(() => onRealtime('absences:changed', load), [load])

  const onRefresh = () => { setRefreshing(true); load() }

  // Days you actually teach on, from today up to a month ahead — no free-text date entry,
  // so you can never file an absence against a day with no class in the first place. The
  // month lets you book known absences (travel, medical, a funeral) well in advance rather
  // than only within the current week.
  const dayChoices = bookingWindowDates(periodEnd).filter((w) => slots.some((s) => s.dayOfWeek === w.dayOfWeek && s.subjectId))
  // Booking weeks ahead makes it easy to forget you already filed a day, and a repeat save
  // is silently swallowed server-side (the row is unique on teacher+slot+date), so the
  // picker shows those periods as already reported rather than letting it look like
  // nothing happened.
  const reportedPeriods = new Map<string, number>()
  for (const a of absences) {
    const key = `${a.date}|${a.timetableSlotId}`
    // periods is 1 for a per-period row and the whole block for a legacy one, so both
    // shapes add up to "how much of this slot is already on record".
    reportedPeriods.set(key, (reportedPeriods.get(key) ?? 0) + (a.periods ?? 1))
  }

  const openModal = () => {
    const today = todayStr()
    const initial = dayChoices.find((c) => c.date === today)?.date ?? dayChoices[0]?.date ?? ''
    setDate(initial); setSelections({})
    setModalVisible(true)
  }

  const pendingDays = selectionsToDays(selections, slots)

  const handleSubmit = async () => {
    if (pendingDays.length === 0) {
      Alert.alert(t('Validation'), t('Select the whole day or at least one period'))
      return
    }
    setSaving(true)
    try {
      const result = await reportAbsence({ days: pendingDays })
      setModalVisible(false)
      load()
      Alert.alert(
        t('Saved'),
        result.count === 0
          ? t('Those periods were already reported.')
          : result.days > 1
            ? `${result.count} ${result.count === 1 ? t('period') : t('periods')} ${t('recorded across')} ${result.days} ${t('days')}.`
            : t('Absence recorded'),
      )
    } catch (err: any) {
      Alert.alert(t('Error'), err.response?.data?.message || t('Failed to record absence'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAbsence = (id: string, graceExpired = false) => {
    // Past the arrival window the school already counts this period as lost, so removing
    // the record is marking the teacher present after the fact. Say so plainly rather than
    // asking the same neutral "remove?" as an ordinary correction.
    const title = graceExpired ? t('This period was already lost') : t('Remove absence?')
    const body = graceExpired
      ? (periodMinutes != null && graceMinutes != null
          ? `${t('The')} ${graceMinutes}${t('-minute window to arrive has passed, so this period counts as missed and not taught. Removing it marks them present anyway.')}`
          : t('The window to arrive has passed, so this period counts as missed and not taught. Removing it marks them present anyway.'))
      : t('This cannot be undone.')
    Alert.alert(title, body, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Remove'), style: 'destructive', onPress: async () => {
          try { await deleteAbsence(id); load() } catch (err: any) {
            // The list may simply be stale: an admin can review (locking it) or the grace
            // period can expire while this screen sits open, and the bin stays on screen
            // until something refetches. Show the API's actual reason and reload, so the
            // row corrects itself instead of failing again on the next tap.
            Alert.alert(t('Cannot remove'), err?.response?.data?.message || t('Failed to remove absence'))
            load()
          }
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
            <Text style={[styles.emptyText, loadFailed && { color: '#F03E2F' }]}>
              {loadFailed
                ? t('Could not reach the server. Check your connection and pull to refresh.')
                : t('No required-hours target has been set for any of your subjects yet.')}
            </Text>
          </View>
        ) : rows.map((r) => (
          <View key={r.subjectId} style={styles.card}>
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
            {/* The figures above are the COURSE's, which is what the target measures. When
                somebody else also taught it, this teacher's own share is called out — without
                it a teacher who joined in November would look as though they had missed the
                hours taught before they arrived. */}
            {(() => {
              const mine = r.contributors.find((c) => c.teacherId === user?.id)
              if (!mine || r.contributors.length < 2) return null
              return (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
                  {t('You taught')} {formatHours(mine.taughtHours)} {t('of this')} · {r.contributors.length} {t('teachers on this course')}
                </Text>
              )
            })()}
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
              const locked = a.isFinal || a.graceExpired || a.seenByAdmin
              return (
                <TouchableOpacity
                  key={a.id}
                  style={styles.absenceRow}
                  activeOpacity={0.7}
                  // Opens the timetable at the period this absence refers to, greyed out.
                  // Only that one slot is marked; a normal visit is unchanged.
                  onPress={() => router.push({
                    pathname: '/(tabs)/timetable',
                    params: { missedSlotId: a.timetableSlotId, missedDate: a.date, missedFrom: a.startTime, missedTo: a.endTime },
                  } as any)}
                >
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
                </TouchableOpacity>
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

            <Text style={styles.label}>{t('Days')} <Text style={styles.required}>*</Text></Text>
            <AbsenceDayPicker
              slots={slots}
              reportedPeriods={reportedPeriods}
              periodMinutes={periodMinutes}
              periodEnd={periodEnd}
              selections={selections}
              onChange={setSelections}
              date={date}
              onDateChange={setDate}
              colors={colors}
              t={t}
              noDaysMessage={t('No periods on your timetable in the coming month.')}
            />

            <TouchableOpacity
              style={[styles.createBtn, (saving || pendingDays.length === 0) && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || pendingDays.length === 0}
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
  const graceMinutes = school?.absenceGraceMinutes ?? null
  const isUniversity = school?.type === 'UNIVERSITY'

  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])

  // By Course (existing coverage cards, only courses with an hours target) vs By Teacher
  // (every teacher, every absence — a course with no target set is otherwise invisible).
  // Defaults to By Teacher, not By Course. A coverage row only exists for a course with a
  // required-hours target, so By Course structurally CANNOT show an absence on any untargeted
  // course — a school with 43 teachers and one target showed an admin a near-empty table
  // while the teacher's own screen listed four absences. "Who has been absent" is what this
  // page is opened for; hours-coverage tracking is one click away under By Course.
  const [viewMode, setViewMode] = useState<'course' | 'teacher'>('teacher')
  const [teacherSearch, setTeacherSearch] = useState('')
  // Value stored is PERIODS missed per teacher; periodMinutes null → numbers are event
  // counts, labelled "absences" rather than "periods".
  const [unassignedTargets, setUnassignedTargets] = useState<UnassignedTarget[]>([])
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number>>({})
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  // Booking cutoff, same meaning as on the teacher's own screen. Comes from the counts
  // endpoint rather than a per-teacher fetch, which would mark their records reviewed.
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [hoursTotals, setHoursTotals] = useState<Record<string, TeacherHoursTotal>>({})
  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period') : t('periods')) : (n === 1 ? t('absence') : t('absences'))

  const router = useRouter()
  const [drillDown, setDrillDown] = useState<DrillTarget | null>(null)
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [absencesLoading, setAbsencesLoading] = useState(false)

  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [teacherPickerVisible, setTeacherPickerVisible] = useState(false)
  const [reportTeacher, setReportTeacher] = useState<Teacher | null>(null)
  const [teacherSlots, setTeacherSlots] = useState<MyTimetableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [date, setDate] = useState('')
  // Per-date, so switching days keeps what was ticked on each. See AbsenceDayPicker.
  const [selections, setSelections] = useState<Selections>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getCoverage()
      .then((d) => { setRows(d.rows); setUnassignedTargets(d.unassignedTargets ?? []) })
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  const loadCounts = useCallback(() => {
    getAbsenceCounts()
      .then((d) => { setAbsenceCounts(Object.fromEntries(d.counts.map((c) => [c.teacherId, c.periods]))); setPeriodMinutes(d.periodMinutes); setPeriodEnd(d.periodEnd) })
      .catch(() => {})
  }, [])

  const loadHoursTotals = useCallback(() => {
    getTeacherHoursTotals()
      .then((d) => setHoursTotals(Object.fromEntries(d.totals.map((tot) => [tot.teacherId, tot]))))
      .catch(() => {})
  }, [])

  useFocusEffect(useCallback(() => { load(); loadCounts(); loadHoursTotals() }, [load, loadCounts, loadHoursTotals]))
  // A teacher anywhere in the school reporting or retracting changes coverage and the counts
  // shown here, so the admin's view keeps up without a manual refresh.
  useEffect(() => onRealtime('absences:changed', () => { load(); loadCounts() }), [load, loadCounts])
  useEffect(() => { getTeachers().then((d) => setTeachers(d.teachers)).catch(() => {}) }, [])

  const onRefresh = () => { setRefreshing(true); load(); loadCounts() }

  const teacherRows = teachers
    .map((tch) => ({ ...tch, count: absenceCounts[tch.id] ?? 0 }))
    .filter((tch) => !teacherSearch.trim() || tch.name.toLowerCase().includes(teacherSearch.toLowerCase()))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.subjectName.toLowerCase().includes(q) || r.classLevel.toLowerCase().includes(q)
      || r.contributors.some((c) => c.teacherName.toLowerCase().includes(q))
  })

  // Absences belong to a person, not a course, so drilling in is per contributor.
  const openDrillDown = (row: CoverageRow, c: { teacherId: string; teacherName: string }) => {
    setDrillDown({ teacherId: c.teacherId, teacherName: c.teacherName, subjectName: row.subjectName, classLevel: row.classLevel })
    setAbsencesLoading(true)
    getTeacherAbsences(c.teacherId)
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

  const handleDeleteAbsence = (id: string, graceExpired = false) => {
    // Past the arrival window the school already counts this period as lost, so removing
    // the record is marking the teacher present after the fact. Say so plainly rather than
    // asking the same neutral "remove?" as an ordinary correction.
    const title = graceExpired ? t('This period was already lost') : t('Remove absence?')
    const body = graceExpired
      ? (periodMinutes != null && graceMinutes != null
          ? `${t('The')} ${graceMinutes}${t('-minute window to arrive has passed, so this period counts as missed and not taught. Removing it marks them present anyway.')}`
          : t('The window to arrive has passed, so this period counts as missed and not taught. Removing it marks them present anyway.'))
      : t('This cannot be undone.')
    Alert.alert(title, body, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: graceExpired ? t('Mark present anyway') : t('Remove'), style: 'destructive', onPress: async () => {
          try {
            await deleteAbsence(id)
            setAbsences((prev) => prev.filter((a) => a.id !== id))
            // The hour this absence was subtracting goes straight back into taughtHours/
            // projectedFinalHours server-side (computed fresh every fetch, nothing
            // cached) — refetch here so that's visible immediately, not just next load.
            load()
            loadCounts()
          } catch (err: any) {
            Alert.alert(t('Cannot remove'), err?.response?.data?.message || t('Failed to remove absence'))
            load(); loadCounts()
          }
        },
      },
    ])
  }

  const openReportModal = () => {
    setReportTeacher(null); setTeacherSlots([]); setDate(''); setSelections({})
    setReportModalVisible(true)
  }

  const onPickTeacher = (teacher: Teacher) => {
    setReportTeacher(teacher); setDate(''); setSelections({})
    setTeacherPickerVisible(false)
    setSlotsLoading(true)
    getTeacherTimetable(teacher.id)
      .then((d) => {
        setTeacherSlots(d.slots)
        // Land on today when they teach today, otherwise their next teaching day — the
        // picker needs a day in hand, and this teacher's timetable is only known now.
        const choices = bookingWindowDates(periodEnd).filter((w) => d.slots.some((s) => s.dayOfWeek === w.dayOfWeek && s.subjectId))
        setDate(choices.find((c) => c.date === todayStr())?.date ?? choices[0]?.date ?? '')
      })
      .catch(() => setTeacherSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  // Same "today up to a month ahead, days they actually teach" window as the teacher's own
  // flow — just against the SELECTED teacher's timetable rather than the admin's own. Kept
  // deliberately identical: an admin logging it on their behalf shouldn't have a narrower
  // reach than the teacher, and the API applies the same rules to both.
  const pendingDays = selectionsToDays(selections, teacherSlots, true)

  const handleSubmit = async () => {
    if (!reportTeacher) {
      Alert.alert(t('Validation'), t('Select a teacher and a day'))
      return
    }
    if (pendingDays.length === 0) {
      Alert.alert(t('Validation'), t('Select the whole day or at least one period'))
      return
    }
    setSaving(true)
    try {
      const result = await reportAbsence({ teacherId: reportTeacher.id, days: pendingDays })
      setReportModalVisible(false)
      load()
      loadCounts()
      if (drillDown && drillDown.teacherId === reportTeacher.id) {
        // Refresh whichever drill-down was open — course-scoped or the full teacher list.
        if (drillDown.subjectName) {
          const row = rows.find((r) => r.subjectName === drillDown.subjectName && r.classLevel === drillDown.classLevel
            && r.contributors.some((c) => c.teacherId === drillDown.teacherId))
          const contributor = row?.contributors.find((c) => c.teacherId === drillDown.teacherId)
          if (row && contributor) openDrillDown(row, contributor)
        } else {
          openTeacherDrillDown(drillDown.teacherId, drillDown.teacherName)
        }
      }
      Alert.alert(
        t('Saved'),
        result.count === 0
          ? t('Those periods were already reported.')
          : result.days > 1
            ? `${result.count} ${result.count === 1 ? t('period') : t('periods')} ${t('recorded across')} ${result.days} ${t('days')}.`
            : t('Absence recorded'),
      )
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
          {/* A total, so absences are legible at a glance instead of hidden in a long list
              of teachers who have none. */}
          {(() => {
            const withAbsences = teacherRows.filter((r) => r.count > 0)
            const totalPeriods = withAbsences.reduce((sum, r) => sum + r.count, 0)
            return (
              <Text style={{ paddingHorizontal: 16, paddingTop: 8, fontSize: 14, fontWeight: '700', color: colors.text }}>
                {totalPeriods === 0
                  ? t('No absences recorded yet.')
                  : `${totalPeriods} ${t(totalPeriods === 1 ? 'period missed' : 'periods missed')} · ${withAbsences.length} ${t(withAbsences.length === 1 ? 'teacher' : 'teachers')}`}
              </Text>
            )
          })()}
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
            keyExtractor={(r) => r.subjectId}
            contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="time-outline" size={36} color={colors.textMuted} />
                {unassignedTargets.length > 0 ? (
                  <>
                    {/* An hours target with nobody assigned produces no coverage row, which
                        is not the same thing as no target being set anywhere. */}
                    <Text style={[styles.emptyText, { color: colors.text, fontWeight: '600' }]}>
                      {unassignedTargets.length === 1
                        ? t('One course has an hours target but no lecturer assigned.')
                        : `${unassignedTargets.length} ${t('courses have an hours target but no lecturer assigned.')}`}
                    </Text>
                    <Text style={styles.emptyText}>
                      {t('Hours are counted against the lecturer who teaches the course, so assign one and it will appear here.')}
                    </Text>
                    {unassignedTargets.slice(0, 5).map((u) => (
                      <Text key={`${u.classLevel}-${u.name}`} style={[styles.emptyText, { fontSize: 12 }]}>
                        {u.name} · {u.classLevel}
                      </Text>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>{t('No subjects have a required-hours target set yet.')}</Text>
                )}
              </View>
            }
            // The COURSE is the card: its target is stated once and measured against
            // everything taught on it. Contributors are listed beneath, each tappable for
            // their own absences, because absences belong to a person not a course.
            renderItem={({ item: r }) => (
              <View style={styles.coverageCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={styles.teacherNameText}>
                    {r.contributors.length === 1 ? r.contributors[0].teacherName : `${r.contributors.length} ${t('teachers')}`}
                  </Text>
                  {r.periodsMissed > 0 && (
                    <View style={{ backgroundColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#c2410c' }}>{r.periodsMissed}</Text>
                    </View>
                  )}
                  {r.gaps.length > 0 && (
                    <View style={{ backgroundColor: r.gaps.some((g) => g.elapsed) ? '#fecaca' : '#fde68a', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: r.gaps.some((g) => g.elapsed) ? '#b91c1c' : '#92400e' }}>
                        {r.gaps.some((g) => g.elapsed) ? t('no teacher') : t('unstaffed ahead')}
                      </Text>
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
                {r.contributors.map((c) => (
                  <TouchableOpacity
                    key={c.teacherId}
                    onPress={() => openDrillDown(r, c)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{c.teacherName}</Text>
                      {/* The window they held it — what makes a mid-term handover legible. */}
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>
                        {c.startedAt} → {c.endedAt ?? t('present')} · {formatHours(c.taughtHours)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
                {r.gaps.map((g) => (
                  <View key={`${g.startDate}-${g.endDate}`} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontStyle: 'italic', color: colors.textMuted }}>
                      {g.elapsed ? t('No teacher held this course') : t('No teacher assigned from')} {g.startDate} → {g.endDate}
                    </Text>
                  </View>
                ))}
              </View>
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
              // reported for is FINAL (isFinal: start + the school's grace period, or the
              // for everyone, since there's no more chance the teacher shows up.
              <ScrollView style={{ maxHeight: 320 }}>
                {absences.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.absenceRow}
                    activeOpacity={0.7}
                    // Opens THAT teacher's timetable (not the admin's own) at the period
                    // this absence refers to. The drill-down is a <Modal>, which sits ABOVE
                    // the navigator — pushing without closing it first navigates underneath
                    // and looks like nothing happened. Closed first, then pushed on the next
                    // frame so iOS has finished dismissing before the navigation starts.
                    onPress={() => {
                      const target = {
                        teacherId: drillDown?.teacherId ?? '',
                        teacherName: drillDown?.teacherName ?? '',
                        missedSlotId: a.timetableSlotId,
                        missedDate: a.date,
                        missedFrom: a.startTime,
                        missedTo: a.endTime,
                      }
                      setDrillDown(null)
                      requestAnimationFrame(() => router.push({ pathname: '/teacher-timetable', params: target } as any))
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.absenceText}>{a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</Text>
                      {/* Only shown in the unscoped "By Teacher" view — the "By Course"
                          view already scopes the whole list to one course. */}
                      {!drillDown?.subjectName && (a.subjectName || a.classLevel) && (
                        <Text style={styles.absenceHint}>{a.subjectName} · {a.classLevel}</Text>
                      )}
                      {a.seenByAdmin && <Text style={styles.absenceHint}>{t('reviewed')}</Text>}
                    </View>
                    {a.isFinal ? (
                      // A bare padlock reads as "deleting is not allowed here". Naming the
                      // reason makes it clear the rule is about THIS period being over.
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.absenceHint}>{t('period over')}</Text>
                        <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => handleDeleteAbsence(a.id, a.graceExpired)}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
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
                // Distinct from "none in the coming month" below — catches the exact confusion
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
                  <Text style={styles.label}>{t('Days')} <Text style={styles.required}>*</Text></Text>
                  <AbsenceDayPicker
                    asAdmin
                    slots={teacherSlots}
                    // Empty: the admin has no copy of this teacher's absences here, and
                    // fetching them would mark every one of their records as reviewed as a
                    // side effect. A day already on record is simply skipped server-side.
                    reportedPeriods={EMPTY_REPORTED_PERIODS}
                    periodMinutes={periodMinutes}
                    periodEnd={periodEnd}
                    selections={selections}
                    onChange={setSelections}
                    date={date}
                    onDateChange={setDate}
                    colors={colors}
                    t={t}
                    noDaysMessage={t("No periods on this teacher's timetable in the coming month.")}
                  />
                </>
              )
            )}

            <TouchableOpacity
              style={[styles.createBtn, (saving || !reportTeacher || pendingDays.length === 0) && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || !reportTeacher || pendingDays.length === 0}
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
