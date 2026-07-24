import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

// Mobile port of the web app's WeekGrid (apps/web/components/ui/WeekGrid.tsx) — a
// read-only day-columns x hour-rows calendar grid, slot positions/heights computed
// from start/end times and placed absolutely within each day's column. Kept the
// same layout math so the two stay visually/behaviourally in sync.

export interface WeekGridSlot {
  id: string
  dayOfWeek: string // 'MONDAY'..'SUNDAY'
  startTime: string // "HH:MM", 24h
  endTime: string
  title: string
  subtitle?: string | null
  isPrivate?: boolean
}

export interface WeekGridBreak {
  id: string
  startTime: string
  endTime: string
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayShort = (d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase()

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 17
const HOUR_HEIGHT = 56
const HEADER_HEIGHT = 32
const GUTTER_WIDTH = 44
const COLUMN_WIDTH = 104

export default function WeekGrid({ slots, breaks = [], onSlotClick }: {
  slots: WeekGridSlot[]
  breaks?: WeekGridBreak[]
  onSlotClick?: (slot: WeekGridSlot) => void
}) {
  const { colors, isDark } = useTheme()
  const t = useT()

  const allStarts = [...slots.map((s) => toMinutes(s.startTime)), ...breaks.map((b) => toMinutes(b.startTime))]
  const allEnds = [...slots.map((s) => toMinutes(s.endTime)), ...breaks.map((b) => toMinutes(b.endTime))]
  const startHour = Math.min(DEFAULT_START_HOUR, ...(allStarts.length ? [Math.floor(Math.min(...allStarts) / 60)] : []))
  const endHour = Math.max(DEFAULT_END_HOUR, ...(allEnds.length ? [Math.ceil(Math.max(...allEnds) / 60)] : []))
  const gridStartMinutes = startHour * 60
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT

  const hourMarks: number[] = []
  for (let h = startHour; h <= endHour; h++) hourMarks.push(h)
  const formatHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

  const totalWidth = GUTTER_WIDTH + DAY_ORDER.length * COLUMN_WIDTH
  const privateBg = isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb'
  const privateBorder = isDark ? 'rgba(245,158,11,0.35)' : '#fde68a'
  const privateText = isDark ? '#fbbf24' : '#92400e'
  const slotBg = isDark ? 'rgba(240,62,47,0.14)' : '#FEF2F1'
  const slotBorder = isDark ? 'rgba(240,62,47,0.35)' : '#fecaca'

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: totalWidth, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card }}>
        <View style={{ flexDirection: 'row' }}>
          {/* Hour gutter */}
          <View style={{ width: GUTTER_WIDTH, borderRightWidth: 1, borderRightColor: colors.border }}>
            <View style={{ height: HEADER_HEIGHT }} />
            <View style={{ height: bodyHeight }}>
              {hourMarks.map((h) => (
                <Text key={h} style={{
                  position: 'absolute', right: 6, top: (h - startHour) * HOUR_HEIGHT - 6,
                  fontSize: 9, color: colors.textMuted,
                }}>
                  {formatHour(h)}
                </Text>
              ))}
            </View>
          </View>

          {/* Day columns */}
          {DAY_ORDER.map((day, dayIdx) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === day)
            return (
              <View key={day} style={{
                width: COLUMN_WIDTH,
                borderRightWidth: dayIdx === DAY_ORDER.length - 1 ? 0 : 1,
                borderRightColor: colors.border,
              }}>
                <View style={{
                  height: HEADER_HEIGHT, alignItems: 'center', justifyContent: 'center',
                  borderBottomWidth: 1, borderBottomColor: colors.border,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>{t(dayShort(day))}</Text>
                </View>
                <View style={{ height: bodyHeight }}>
                  {hourMarks.map((h) => (
                    <View key={h} style={{
                      position: 'absolute', left: 0, right: 0, top: (h - startHour) * HOUR_HEIGHT,
                      borderTopWidth: 1, borderTopColor: colors.borderLight,
                    }} />
                  ))}
                  {daySlots.map((s) => {
                    const top = (toMinutes(s.startTime) - gridStartMinutes) / 60 * HOUR_HEIGHT
                    const height = Math.max((toMinutes(s.endTime) - toMinutes(s.startTime)) / 60 * HOUR_HEIGHT, 24)
                    return (
                      <TouchableOpacity
                        key={s.id}
                        activeOpacity={onSlotClick ? 0.7 : 1}
                        disabled={!onSlotClick}
                        onPress={() => onSlotClick?.(s)}
                        style={{
                          position: 'absolute', left: 3, right: 3, top, height,
                          borderRadius: 8, borderWidth: 1, padding: 5, overflow: 'hidden',
                          backgroundColor: s.isPrivate ? privateBg : slotBg,
                          borderColor: s.isPrivate ? privateBorder : slotBorder,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', color: s.isPrivate ? privateText : colors.primary }}>
                          {s.title}
                        </Text>
                        {!!s.subtitle && (
                          <Text numberOfLines={1} style={{ fontSize: 9, color: s.isPrivate ? privateText : colors.primary, opacity: 0.8 }}>
                            {s.subtitle}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>

        {/* Break bands — shared across every day column, same for all teachers */}
        {breaks.map((b) => {
          const top = HEADER_HEIGHT + (toMinutes(b.startTime) - gridStartMinutes) / 60 * HOUR_HEIGHT
          const height = (toMinutes(b.endTime) - toMinutes(b.startTime)) / 60 * HOUR_HEIGHT
          return (
            <View key={b.id} pointerEvents="none" style={{
              position: 'absolute', left: GUTTER_WIDTH, right: 0, top, height,
              backgroundColor: colors.bgSecondary, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {t('Break')}
              </Text>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}
