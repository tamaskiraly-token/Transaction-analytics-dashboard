import { format } from 'date-fns'
import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { parseDateOnlyIso } from '../../lib/dateUtils'

type Row = {
  dateIso: string
  actualCumulative: number | null
}

type RowWithDaily = Row & {
  dailyRunRate: number | null
  avgDailyRunRate: number | null
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

export function DailyRunRateChart(props: {
  title: string
  subtitle?: string
  data: Row[]
}) {
  const dataWithDaily: RowWithDaily[] = useMemo(() => {
    let sum = 0
    let n = 0
    let prevActual: number | null = null
    const out: RowWithDaily[] = []

    for (const r of props.data) {
      let daily: number | null = null
      if (r.actualCumulative !== null) {
        daily = prevActual === null ? r.actualCumulative : r.actualCumulative - prevActual
        prevActual = r.actualCumulative
        if (Number.isFinite(daily)) {
          sum += daily
          n += 1
        }
      }
      const avg = n > 0 ? sum / n : null
      out.push({
        ...r,
        dailyRunRate: daily !== null ? Math.max(0, daily) : null,
        avgDailyRunRate: avg,
      })
    }
    return out
  }, [props.data])

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
      </div>

      <div className="mt-3 h-[260px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataWithDaily} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />

            <XAxis
              dataKey="dateIso"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              minTickGap={24}
              angle={-35}
              textAnchor="end"
              height={52}
              tickFormatter={(iso: string) => format(parseDateOnlyIso(iso), 'yyyy-MM-dd')}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={56}
              tickFormatter={(v: number) => formatCompact(v)}
            />

            <Tooltip
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              }}
              labelFormatter={(label) =>
                typeof label === 'string' ? format(parseDateOnlyIso(label), 'EEE, MMM d') : ''
              }
              formatter={(value: unknown, name) => {
                const n = typeof name === 'string' ? name : ''
                if (typeof value !== 'number') return [value as string, name]
                return [Math.round(value).toLocaleString(), n]
              }}
            />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="plainline"
              wrapperStyle={{ paddingBottom: 8 }}
              formatter={(value) => (
                <span style={{ color: '#334155', fontSize: 12, fontWeight: 600 }}>{value}</span>
              )}
            />

            <Line
              type="monotone"
              dataKey="dailyRunRate"
              name="Daily run rate"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />

            <Line
              type="monotone"
              dataKey="avgDailyRunRate"
              name="Avg run rate (MTD)"
              stroke="#7c3aed"
              strokeWidth={1.8}
              dot={false}
              strokeDasharray="3 3"
              connectNulls={true}
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

