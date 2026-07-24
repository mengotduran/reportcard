'use client'
import { useEffect, useRef, useState } from 'react'
import { WeeklyStats } from '@/lib/api/dashboard'
import { Users, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useT } from '@/lib/i18n'

export type ChartCfg = {
  key: 'students' | 'reportCards' | 'teachers' | 'subjects'
  label: string
  color: string
  type: 'area' | 'line' | 'bar'
  icon: typeof Users
  statKey: 'students' | 'reportCards' | 'teachers' | 'subjects'
}

const CHART_HEIGHT = 90
const STROKE_INSET = 4 // keeps the 2px stroke from clipping at the top/bottom edge

function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

function TrendIndicator({ data }: { data: number[] }) {
  const t = useT()
  const last = data[data.length - 1] ?? 0
  const prev = data[data.length - 2] ?? 0
  const delta = last - prev
  if (delta > 0) return <span className="flex items-center gap-1 text-green-500 text-xs font-semibold"><TrendingUp size={13} />+{delta} {t('this week')}</span>
  if (delta < 0) return <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown size={13} />{delta} {t('this week')}</span>
  return <span className="flex items-center gap-1 text-muted-foreground text-xs font-semibold"><Minus size={13} />{t('No change')}</span>
}

// Recharts' composition (ResponsiveContainer AND its own Line/Bar/Area/Grid children)
// silently renders nothing under React 19 — recharts/recharts#4590, #6857, open upstream
// with no fix even at 3.10.0, and no console error to point at. Rather than depend on a
// broken third-party render path for an 8-point sparkline, this draws it by hand: a plain
// SVG polyline/area/bars sized from a measured container width. Small enough that hand-
// rolling it is less risk than chasing a library bug with no confirmed resolution.
function Sparkline({ data, width, color, type }: { data: number[]; width: number; color: string; type: ChartCfg['type'] }) {
  const n = data.length
  if (n === 0 || width === 0) return null
  const max = Math.max(...data, 1)
  const usableHeight = CHART_HEIGHT - STROKE_INSET * 2
  const x = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width)
  const y = (v: number) => CHART_HEIGHT - STROKE_INSET - (v / max) * usableHeight

  if (type === 'bar') {
    const slot = width / n
    const barWidth = Math.min(24, slot * 0.6)
    return (
      <svg width={width} height={CHART_HEIGHT} className="overflow-visible">
        {data.map((v, i) => {
          const barHeight = Math.max(2, (v / max) * usableHeight)
          return (
            <rect
              key={i}
              x={x(i) - barWidth / 2}
              y={CHART_HEIGHT - STROKE_INSET - barHeight}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={color}
            >
              <title>{v.toLocaleString()}</title>
            </rect>
          )
        })}
      </svg>
    )
  }

  const linePath = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const areaPath = `${linePath} L${x(n - 1)},${CHART_HEIGHT} L${x(0)},${CHART_HEIGHT} Z`

  return (
    <svg width={width} height={CHART_HEIGHT} className="overflow-visible">
      {type === 'area' && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={8} fill="transparent">
          <title>{v.toLocaleString()}</title>
        </circle>
      ))}
    </svg>
  )
}

export default function WeeklyChart({ cfg, weekData, total }: { cfg: ChartCfg; weekData: WeeklyStats; total: number }) {
  const t = useT()
  const values = weekData[cfg.key] ?? []
  const Icon = cfg.icon
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>()

  const labels = weekData.labels ?? []
  const tickIdxs = labels.length > 1 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : [0]

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold text-foreground">{total.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">{t(cfg.label)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: cfg.color + '18' }}>
            <Icon size={18} style={{ color: cfg.color }} />
          </div>
          <TrendIndicator data={values} />
        </div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT }}>
        <Sparkline data={values} width={width} color={cfg.color} type={cfg.type} />
      </div>

      <div className="flex items-center justify-between -mt-1">
        {tickIdxs.map((i) => (
          <span key={i} className="text-[9px] text-muted-foreground">{labels[i]}</span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-right -mt-1">{t('8-week trend')}</p>
    </div>
  )
}
