'use client'
import { useEffect, useRef } from 'react'
import { useT } from '@/lib/i18n'

// A read-only day-columns x hour-rows calendar grid — visually similar to a
// Google-Calendar-style week view, but purely for RENDERING already-known
// data (no drag-to-create/resize). Slot positions/heights are computed from
// their start/end times and placed absolutely within each day's column.
// Editing (add/edit/delete) happens via a separate form, not by interacting
// with this grid directly — `onSlotClick` just opens that form pre-filled.

export interface WeekGridSlot {
  id: string
  dayOfWeek: string // 'MONDAY'..'SUNDAY'
  startTime: string // "HH:MM", 24h
  endTime: string
  title: string
  subtitle?: string | null
  isPrivate?: boolean
  /** Arrived here from an absence or a notification naming THIS slot. Ringed rather
   *  than restyled: it is a "you are looking at this one" marker, and must not be
   *  confused with the absent/missed styling, which is data about the class itself. */
  focused?: boolean
  // A one-off slot (a specific calendar date, not a weekly recurrence) — shown with a
  // dashed border so it reads as "just this once" rather than part of the standing schedule.
  isOneOff?: boolean
  /** Reported absent and ALREADY past: greyed and struck through, it was not taught. */
  missed?: boolean
  /** Reported absent but STILL TO COME. Marked distinctly from a lost period, because
   *  nothing has been lost yet and the report can still be retracted. */
  reportedAbsent?: boolean
  /** Short note under the subtitle, e.g. the dates reported. The grid is a recurring week
   *  with no dates of its own, so without this "absent" would not say WHICH week. */
  note?: string | null
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
const HEADER_HEIGHT = 36
const GUTTER_WIDTH = 48 // matches w-12

export default function WeekGrid({ slots, breaks = [], onSlotClick }: {
  slots: WeekGridSlot[]
  breaks?: WeekGridBreak[]
  onSlotClick?: (slot: WeekGridSlot) => void
}) {
  const tr = useT()
  const allStarts = [...slots.map((s) => toMinutes(s.startTime)), ...breaks.map((b) => toMinutes(b.startTime))]
  const allEnds = [...slots.map((s) => toMinutes(s.endTime)), ...breaks.map((b) => toMinutes(b.endTime))]
  const startHour = Math.min(DEFAULT_START_HOUR, ...(allStarts.length ? [Math.floor(Math.min(...allStarts) / 60)] : []))
  const endHour = Math.max(DEFAULT_END_HOUR, ...(allEnds.length ? [Math.ceil(Math.max(...allEnds) / 60)] : []))
  const gridStartMinutes = startHour * 60
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT

  const hourMarks: number[] = []
  for (let h = startHour; h <= endHour; h++) hourMarks.push(h)

  const formatHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

  // Scrolls the focused slot into view exactly once, when it first shows up — not a plain
  // inline ref callback, which React treats as a NEW function every render and re-invokes
  // on each one, so a smooth scrollIntoView kept firing on every realtime update and made
  // manual scrolling feel like it was being yanked back.
  const focusedRef = useRef<HTMLButtonElement | null>(null)
  const focusedId = slots.find((s) => s.focused)?.id
  useEffect(() => {
    if (!focusedId) return
    focusedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusedId])

  return (
    // Wrapped in its own horizontal scroller — 7 day columns plus the hour
    // gutter don't fit a phone width, so this scrolls internally instead of
    // overflowing the page, same pattern used for wide tables elsewhere. The
    // min-width lives on the inner (relative) div, not this wrapper, so the
    // break bands below — absolutely positioned against that inner div —
    // scroll together with the columns as one unit instead of staying put.
    <div className="overflow-x-auto">
      <div className="relative border border-border rounded-xl overflow-hidden bg-card" style={{ minWidth: GUTTER_WIDTH + DAY_ORDER.length * 92 }}>
      <div className="flex">
        {/* Hour gutter */}
        <div className="w-12 flex-shrink-0 border-r border-border">
          <div style={{ height: HEADER_HEIGHT }} />
          <div className="relative" style={{ height: bodyHeight }}>
            {hourMarks.map((h) => (
              <div key={h} className="absolute right-1.5 text-[10px] text-muted-foreground -translate-y-1/2"
                style={{ top: (h - startHour) * HOUR_HEIGHT }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {DAY_ORDER.map((day) => {
          const daySlots = slots.filter((s) => s.dayOfWeek === day)
          return (
            <div key={day} className="flex-1 border-r border-border last:border-r-0 min-w-[92px]">
              <div style={{ height: HEADER_HEIGHT }} className="flex items-center justify-center text-xs font-semibold text-foreground border-b border-border">
                {dayShort(day)}
              </div>
              <div className="relative" style={{ height: bodyHeight }}>
                {hourMarks.map((h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-border/60"
                    style={{ top: (h - startHour) * HOUR_HEIGHT }} />
                ))}
                {daySlots.map((s) => {
                  const top = (toMinutes(s.startTime) - gridStartMinutes) / 60 * HOUR_HEIGHT
                  const height = Math.max((toMinutes(s.endTime) - toMinutes(s.startTime)) / 60 * HOUR_HEIGHT, 22)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      ref={s.focused ? focusedRef : undefined}
                      onClick={() => onSlotClick?.(s)}
                      disabled={!onSlotClick}
                      className={`absolute left-1 right-1 rounded-md px-1.5 py-1 text-left overflow-hidden border transition ${
                        s.missed
                          ? 'bg-muted border-border text-muted-foreground opacity-75'
                          : s.reportedAbsent
                            ? 'bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-500/15 dark:border-slate-500/40 dark:text-slate-300'
                            : s.isPrivate
                              ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400'
                              : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/15'
                      } ${s.isOneOff || s.reportedAbsent ? 'border-dashed' : ''} ${s.focused ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''} ${onSlotClick ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{ top, height, zIndex: 1 }}
                    >
                      <div className={`text-[11px] font-semibold leading-tight truncate ${s.missed ? 'line-through' : ''}`}>{s.title}</div>
                      {s.subtitle && <div className="text-[10px] leading-tight opacity-80 truncate">{s.subtitle}</div>}
                      {s.note && <div className="text-[9px] font-bold leading-tight truncate mt-0.5">{s.note}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Break bands — shared across every day column, same for all teachers */}
      {breaks.map((b) => {
        const top = HEADER_HEIGHT + (toMinutes(b.startTime) - gridStartMinutes) / 60 * HOUR_HEIGHT
        const height = (toMinutes(b.endTime) - toMinutes(b.startTime)) / 60 * HOUR_HEIGHT
        return (
          <div key={b.id}
            className="absolute right-0 bg-muted/80 border-y border-border flex items-center justify-center pointer-events-none"
            style={{ top, height, left: GUTTER_WIDTH }}>
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">{tr('Break')}</span>
          </div>
        )
      })}
      </div>
    </div>
  )
}
