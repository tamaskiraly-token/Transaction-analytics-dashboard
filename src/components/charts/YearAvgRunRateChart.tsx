import { format } from 'date-fns'
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
import type { YearMonthPoint } from '../../lib/yearForecast'

type Row = {
  monthKey: string
  actualAvg: number | null
  baselineAvg: number | null
  optimisticAvg: number | null
  conservativeAvg: number | null
}

function avg(total: number | null, days: number) {
  if (total === null || days <= 0) return null
  return total / days
}

export function YearAvgRunRateChart(props: {
  title: string
  subtitle?: string
  months: YearMonthPoint[]
}) {
  const data: Row[] = props.months
    .slice()
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((m) => {
      const days = m.dayCounts.weekday + m.dayCounts.weekend + m.dayCounts.holiday
      return {
        monthKey: m.monthKey,
        actualAvg: avg(m.actualTotal, days),
        baselineAvg: avg(m.baselineTotal, days),
        optimisticAvg: avg(m.optimisticTotal, days),
        conservativeAvg: avg(m.conservativeTotal, days),
      }
    })

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
          <LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis
              dataKey="monthKey"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(mk: string) => format(parseDateOnlyIso(`${mk}-01`), 'MMM')}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={58}
              tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              }}
              labelFormatter={(label) =>
                typeof label === 'string' ? format(parseDateOnlyIso(`${label}-01`), 'MMM') : ''
              }
              formatter={(value: unknown, name) => {
                if (typeof value !== 'number') return [String(value), name]
                return [Math.round(value).toLocaleString(), name]
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
              dataKey="actualAvg"
              name="Actual avg/day"
              stroke="#0f172a"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="baselineAvg"
              name="Baseline avg/day"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              connectNulls={true}
              strokeDasharray="6 4"
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="optimisticAvg"
              name="Optimistic avg/day"
              stroke="#16a34a"
              strokeWidth={1.8}
              dot={false}
              connectNulls={true}
              strokeDasharray="4 4"
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="conservativeAvg"
              name="Conservative avg/day"
              stroke="#f97316"
              strokeWidth={1.8}
              dot={false}
              connectNulls={true}
              strokeDasharray="4 4"
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

