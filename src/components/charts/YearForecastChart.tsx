import { format } from 'date-fns'
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { YearMonthPoint } from '../../lib/yearForecast'
import { parseDateOnlyIso } from '../../lib/dateUtils'

type Row = {
  monthKey: string
  actualCumulative: number | null
  baselineCumulative: number | null
  optimisticCumulative: number | null
  conservativeCumulative: number | null
  runRateBar?: number | null
}

function fmt(n: number) {
  return Math.round(n).toLocaleString()
}

export function YearForecastChart(props: {
  title: string
  subtitle?: string
  year: number
  months: YearMonthPoint[]
  asOf: { dateIso: string; monthKey: string; currentMonthMtd: number }
  projectionStart: { monthKey: string; ytd: number }
  showRunRateBars?: boolean
}) {
  const showRunRateBars = props.showRunRateBars ?? false
  const data: Row[] = (() => {
    const months = [...props.months].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    const startKey = props.projectionStart.monthKey

    let actualCum = 0
    let baselineCum: number | null = null
    let optimisticCum: number | null = null
    let conservativeCum: number | null = null

    const rows: Row[] = []
    for (const m of months) {
      // Actual cumulative: only completed months (actualTotal provided), then stop.
      if (m.actualTotal !== null) actualCum += m.actualTotal
      const actualCumulative = m.actualTotal !== null ? actualCum : null

      const daysInMonth = m.dayCounts.weekday + m.dayCounts.weekend + m.dayCounts.holiday
      const runRate =
        m.monthKey <= startKey
          ? m.actualTotal !== null
            ? m.actualTotal / Math.max(1, daysInMonth)
            : null
          : m.baselineTotal !== null
            ? m.baselineTotal / Math.max(1, daysInMonth)
            : null

      if (m.monthKey < startKey) {
        rows.push({
          monthKey: m.monthKey,
          actualCumulative,
          baselineCumulative: null,
          optimisticCumulative: null,
          conservativeCumulative: null,
          runRateBar: runRate,
        })
        continue
      }

      if (m.monthKey === startKey) {
        // Projection starts from the last full month (actual YTD point).
        baselineCum = props.projectionStart.ytd
        optimisticCum = props.projectionStart.ytd
        conservativeCum = props.projectionStart.ytd
        rows.push({
          monthKey: m.monthKey,
          actualCumulative,
          baselineCumulative: baselineCum,
          optimisticCumulative: optimisticCum,
          conservativeCumulative: conservativeCum,
          runRateBar: runRate,
        })
        continue
      }

      // Hide scenarios until the projection start month.
      if (baselineCum === null || optimisticCum === null || conservativeCum === null) {
        rows.push({
          monthKey: m.monthKey,
          actualCumulative,
          baselineCumulative: null,
          optimisticCumulative: null,
          conservativeCumulative: null,
          runRateBar: runRate,
        })
        continue
      }

      // Projection months: add the projected month totals (current month is included as its full projected total).
      baselineCum = baselineCum + (m.baselineTotal ?? 0)
      optimisticCum = optimisticCum + (m.optimisticTotal ?? 0)
      conservativeCum = conservativeCum + (m.conservativeTotal ?? 0)

      rows.push({
        monthKey: m.monthKey,
        actualCumulative: null,
        baselineCumulative: baselineCum,
        optimisticCumulative: optimisticCum,
        conservativeCumulative: conservativeCum,
        runRateBar: runRate,
      })
    }
    return rows
  })()

  const anchorX = props.projectionStart.monthKey
  const anchorY = props.projectionStart.ytd

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-500">
          Year: <span className="font-medium text-slate-700">{props.year}</span>
        </div>
      </div>

      <div className="mt-4 h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <ReferenceArea
              x1={anchorX}
              x2={data.at(-1)?.monthKey}
              fill="#e2e8f0"
              fillOpacity={0.35}
              ifOverflow="extendDomain"
            />
            <ReferenceLine x={anchorX} stroke="#94a3b8" strokeDasharray="4 4" />
            <ReferenceDot
              x={anchorX}
              y={anchorY}
              r={5}
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={2}
              label={({ viewBox }) => {
                if (!viewBox) return null
                const vb = viewBox as { x: number; y: number; width?: number; height?: number }
                const x = vb.x
                const y = vb.y
                const chartW = vb.width ?? 0
                const chartH = vb.height ?? 0
                const valueText = `${Math.round(anchorY).toLocaleString()} txns`
                const asOfText = `Projection starts after ${format(parseDateOnlyIso(`${anchorX}-01`), 'MMM')}`
                const w = Math.max(180, valueText.length * 8 + 28)
                const h = 46

                // Prefer left-of-point like the in-month callout, but keep it inside the chart.
                let tx = x - w - 12
                let ty = y - h - 10
                if (tx < 6) tx = x + 12
                if (ty < 6) ty = y + 10
                const leftSafe = 64 // keep clear of Y-axis/ticks
                if (chartW > 0) tx = Math.max(leftSafe, Math.min(tx, chartW - w - 6))
                if (chartH > 0) ty = Math.max(6, Math.min(ty, chartH - h - 6))

                // Connector from callout edge to point.
                const lineX1 = tx < x ? tx + w : tx
                const lineY1 = ty + h / 2
                return (
                  <g>
                    <line
                      x1={lineX1}
                      y1={lineY1}
                      x2={x}
                      y2={y}
                      stroke="#cbd5e1"
                      strokeWidth={1.5}
                    />
                    <g transform={`translate(${tx}, ${ty})`}>
                      <rect x={0} y={0} width={w} height={h} rx={14} fill="#ffffff" stroke="#e2e8f0" />
                      <text x={14} y={19} fontSize={12} fontWeight={700} fill="#0f172a">
                      {valueText}
                      </text>
                      <text x={14} y={35} fontSize={11} fontWeight={600} fill="#64748b">
                        {asOfText}
                      </text>
                    </g>
                  </g>
                )
              }}
            />
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

            {showRunRateBars ? (
              <YAxis
                yAxisId="rr"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={60}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`
                }
                domain={[0, 'auto']}
              />
            ) : null}
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
                return [fmt(value), name]
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

            {showRunRateBars ? (
              <Bar
                yAxisId="rr"
                dataKey="runRateBar"
                name="Avg run rate"
                fill="#94a3b8"
                opacity={0.35}
                barSize={18}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="actualCumulative"
              name="Actual"
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
              dataKey="baselineCumulative"
              name="Baseline"
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
              dataKey="optimisticCumulative"
              name="Optimistic"
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
              dataKey="conservativeCumulative"
              name="Conservative"
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

