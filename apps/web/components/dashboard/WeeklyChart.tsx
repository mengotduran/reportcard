'use client'
import { WeeklyStats } from '@/lib/api/dashboard'
import { Users, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts'

export type ChartCfg = {
  key: 'students' | 'reportCards' | 'teachers' | 'subjects'
  label: string
  color: string
  type: 'area' | 'line' | 'bar'
  icon: typeof Users
  statKey: 'students' | 'reportCards' | 'teachers' | 'subjects'
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

export default function WeeklyChart({ cfg, weekData, total }: { cfg: ChartCfg; weekData: WeeklyStats; total: number }) {
  const t = useT()
  const chartData = weekData.labels.map((label, i) => ({ label, value: weekData[cfg.key][i] ?? 0 }))
  const Icon = cfg.icon

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
          <TrendIndicator data={weekData[cfg.key]} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={90}>
        {cfg.type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Area type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} fill={`url(#grad-${cfg.key})`} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        ) : cfg.type === 'line' ? (
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10 }}
              itemStyle={{ color: cfg.color }}
            />
            <Bar dataKey="value" fill={cfg.color} radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>

      <p className="text-xs text-muted-foreground text-right -mt-1">{t('8-week trend')}</p>
    </div>
  )
}
