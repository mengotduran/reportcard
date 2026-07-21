'use client'

// A read-only month grid — no navigation, always shows the month containing
// `today` (plain Date math, no new dependency, matching WeekGrid.tsx's approach).

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function MonthCalendar({ today = new Date() }: { today?: Date }) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstOfMonth.getDay()

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className="aspect-square flex items-center justify-center">
            {day !== null && (
              <span
                className={`w-full h-full flex items-center justify-center rounded-full text-xs ${
                  day === today.getDate()
                    ? 'bg-primary text-white font-bold'
                    : 'text-foreground'
                }`}
              >
                {day}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
