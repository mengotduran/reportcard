import { View, Text } from 'react-native'
import { Colors } from '@/lib/useTheme'

// A read-only month grid — no navigation, always shows the month containing
// `today` (plain Date math, no new dependency, mirrors the web version).

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function MonthCalendar({ today = new Date(), colors }: { today?: Date; colors: Colors }) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstOfMonth.getDay()

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.textMuted }}>{label}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {week.map((day, di) => (
            <View key={di} style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
              {day !== null && (
                <View style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: day === today.getDate() ? '#F03E2F' : 'transparent',
                }}>
                  <Text style={{ fontSize: 12, color: day === today.getDate() ? '#fff' : colors.text, fontWeight: day === today.getDate() ? '700' : '400' }}>
                    {day}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
