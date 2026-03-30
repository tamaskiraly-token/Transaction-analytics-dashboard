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
import { parseDateOnlyIso } from '../../lib/dateUtils'

type Row = {
  dateIso: string
  actualCumulative: number | null
  baselineCumulative: number | null
  optimisticCumulative: number | null
  conservativeCumulative: number | null
  isForecast: boolean
  runRateBar?: number | null
  rrActual?: number | null
  rrCon?: number | null
  rrBaseExtra?: number | null
  rrOptExtra?: number | null
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

export function CumulativeForecastChart(props: {
  title: string
  subtitle?: string
  data: Row[]
  todayIso: string
  monthEndIso: string
  showRunRateBars?: boolean
  latestActualBubble?: {
    dateIso: string
    mtd: number
    prevMonthMtd: number | null
    mtdVsPrevMonthPct: number | null
  }
  scenarioVsLastMonthPct?: {
    baseline: number | null
    optimistic: number | null
    conservative: number | null
  }
}) {
  const showRunRateBars = props.showRunRateBars ?? false
  const todayX = props.todayIso
  const monthEndX = props.monthEndIso
  const bubble = props.latestActualBubble
  const bubbleY =
    bubble?.dateIso === todayX
      ? props.data.find((r) => r.dateIso === todayX)?.actualCumulative ?? null
      : null

  const bubbleDeltaText =
    bubble?.mtdVsPrevMonthPct === null || bubble?.mtdVsPrevMonthPct === undefined
      ? null
      : `${bubble.mtdVsPrevMonthPct >= 0 ? '+' : ''}${bubble.mtdVsPrevMonthPct.toFixed(1)}% vs last month MTD`

  const dataWithBars: Row[] = (() => {
    const out: Row[] = []
    for (let i = 0; i < props.data.length; i++) {
      const cur = props.data[i]!
      const prev = i > 0 ? props.data[i - 1]! : null
      const actualDaily =
        cur.actualCumulative !== null && prev?.actualCumulative !== null
          ? cur.actualCumulative - (prev?.actualCumulative ?? 0)
          : cur.actualCumulative !== null && prev?.actualCumulative === null
            ? cur.actualCumulative
            : null
      const baselineDaily =
        cur.baselineCumulative !== null && prev?.baselineCumulative !== null
          ? cur.baselineCumulative - (prev?.baselineCumulative ?? 0)
          : null
      const optimisticDaily =
        cur.optimisticCumulative !== null && prev?.optimisticCumulative !== null
          ? cur.optimisticCumulative - (prev?.optimisticCumulative ?? 0)
          : null
      const conservativeDaily =
        cur.conservativeCumulative !== null && prev?.conservativeCumulative !== null
          ? cur.conservativeCumulative - (prev?.conservativeCumulative ?? 0)
          : null

      const v = actualDaily !== null ? actualDaily : cur.isForecast ? baselineDaily : null

      // For projection window, show scenario range as stacked bars:
      // Conservative (bottom) + (Baseline-Conservative) + (Optimistic-Baseline) => top = Optimistic.
      const con = cur.isForecast ? (conservativeDaily ?? null) : null
      const base = cur.isForecast ? (baselineDaily ?? null) : null
      const opt = cur.isForecast ? (optimisticDaily ?? null) : null
      const rrCon = con === null ? null : Math.max(0, con)
      const rrBaseExtra =
        base === null || con === null ? null : Math.max(0, base - con)
      const rrOptExtra =
        opt === null || base === null ? null : Math.max(0, opt - base)

      out.push({
        ...cur,
        runRateBar: v !== null ? Math.max(0, v) : null,
        rrActual: actualDaily !== null ? Math.max(0, actualDaily) : null,
        rrCon,
        rrBaseExtra,
        rrOptExtra,
      })
    }
    return out
  })()

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-500">
          Forecast scenarios: <span className="font-medium text-slate-700">baseline</span> ±5%
        </div>
      </div>

      <div className="mt-4 h-[360px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={`${props.todayIso}_${props.monthEndIso}_${props.data.length}`}
            data={showRunRateBars ? dataWithBars : props.data}
            // Extra right margin keeps month-end labels visible.
            margin={{ top: 10, right: 170, left: 0, bottom: 8 }}
          >
            <CartesianGrid vertical={false} stroke="#eef2f7" />

            <ReferenceArea
              x1={todayX}
              x2={monthEndX}
              fill="#e2e8f0"
              fillOpacity={0.35}
              ifOverflow="extendDomain"
            />

            <ReferenceLine x={todayX} stroke="#94a3b8" strokeDasharray="4 4" />

            {bubble && bubbleY !== null ? (
              <ReferenceDot
                x={bubble.dateIso}
                y={bubbleY}
                r={5}
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth={2}
                label={({ viewBox }) => {
                  if (!viewBox) return null
                  const x = (viewBox as { x: number }).x
                  const y = (viewBox as { y: number }).y

                  const valueText = `${bubble.mtd.toLocaleString()} txns`
                  const deltaText = bubbleDeltaText ?? ''
                  const asOfText = `As of ${format(parseDateOnlyIso(bubble.dateIso), 'MMM d')}`

                  const w = Math.max(170, valueText.length * 8 + 28)
                  const h = deltaText ? 60 : 46

                  return (
                    <g transform={`translate(${x - w - 12}, ${y - h - 10})`}>
                      <line
                        x1={w}
                        y1={h / 2}
                        x2={w + 12}
                        y2={h + 10}
                        stroke="#cbd5e1"
                        strokeWidth={1.5}
                      />
                      <rect
                        x={0}
                        y={0}
                        width={w}
                        height={h}
                        rx={14}
                        fill="#ffffff"
                        stroke="#e2e8f0"
                      />
                      <text x={14} y={19} fontSize={12} fontWeight={700} fill="#0f172a">
                        {valueText}
                      </text>
                      <text x={14} y={35} fontSize={11} fontWeight={600} fill="#64748b">
                        {asOfText}
                      </text>
                      {deltaText ? (
                        <text
                          x={14}
                          y={52}
                          fontSize={11}
                          fontWeight={600}
                          fill={bubble.mtdVsPrevMonthPct !== null && bubble.mtdVsPrevMonthPct >= 0 ? '#16a34a' : '#f97316'}
                        >
                          {deltaText}
                        </text>
                      ) : null}
                    </g>
                  )
                }}
              />
            ) : null}

            {(() => {
              const end = props.data.find((r) => r.dateIso === monthEndX)
              if (!end) return null
              const items: Array<{
                key: string
                y: number | null
                label: string
                stroke: string
              }> = [
                {
                  key: 'end_baseline',
                  y: end.baselineCumulative ?? null,
                  label:
                    end.baselineCumulative === null
                      ? ''
                      : `Baseline: ${Math.round(end.baselineCumulative).toLocaleString()}${
                          props.scenarioVsLastMonthPct?.baseline !== null &&
                          props.scenarioVsLastMonthPct?.baseline !== undefined
                            ? ` (${props.scenarioVsLastMonthPct.baseline >= 0 ? '+' : ''}${props.scenarioVsLastMonthPct.baseline.toFixed(1)}% vs LM)`
                            : ''
                        }`,
                  stroke: '#2563eb',
                },
                {
                  key: 'end_optimistic',
                  y: end.optimisticCumulative ?? null,
                  label:
                    end.optimisticCumulative === null
                      ? ''
                      : `Optimistic: ${Math.round(end.optimisticCumulative).toLocaleString()}${
                          props.scenarioVsLastMonthPct?.optimistic !== null &&
                          props.scenarioVsLastMonthPct?.optimistic !== undefined
                            ? ` (${props.scenarioVsLastMonthPct.optimistic >= 0 ? '+' : ''}${props.scenarioVsLastMonthPct.optimistic.toFixed(1)}% vs LM)`
                            : ''
                        }`,
                  stroke: '#16a34a',
                },
                {
                  key: 'end_conservative',
                  y: end.conservativeCumulative ?? null,
                  label:
                    end.conservativeCumulative === null
                      ? ''
                      : `Conservative: ${Math.round(end.conservativeCumulative).toLocaleString()}${
                          props.scenarioVsLastMonthPct?.conservative !== null &&
                          props.scenarioVsLastMonthPct?.conservative !== undefined
                            ? ` (${props.scenarioVsLastMonthPct.conservative >= 0 ? '+' : ''}${props.scenarioVsLastMonthPct.conservative.toFixed(1)}% vs LM)`
                            : ''
                        }`,
                  stroke: '#f97316',
                },
              ]

              const present = items.filter((it) => it.y !== null) as Array<
                Omit<(typeof items)[number], 'y'> & { y: number }
              >
              const sorted = [...present].sort((a, b) => b.y - a.y)
              const offsets = new Map<string, number>()
              // Keep labels close to endpoints and below legend area.
              const baseOffsets = [4, 10, 16]
              for (let i = 0; i < sorted.length; i++) offsets.set(sorted[i].key, baseOffsets[i] ?? 0)

              return items
                .filter((it) => it.y !== null)
                .map((it) => (
                  <ReferenceDot
                    key={it.key}
                    x={monthEndX}
                    y={it.y as number}
                    r={3.5}
                    fill={it.stroke}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    label={({ viewBox }) => {
                      if (!viewBox) return null
                      const x = (viewBox as { x: number }).x
                      const y = (viewBox as { y: number }).y
                      const text = it.label
                      const dy = offsets.get(it.key) ?? 0
                      const splitIdx = text.indexOf(' (')
                      const main = splitIdx >= 0 ? text.slice(0, splitIdx) : text
                      const pct = splitIdx >= 0 ? text.slice(splitIdx + 2, text.length - 1) : null
                      return (
                        <text
                          x={x + 8}
                          y={y + dy}
                          textAnchor="start"
                          fontSize={11}
                          fontWeight={800}
                          fill={it.stroke}
                          stroke="#ffffff"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          <tspan>{main}</tspan>
                          {pct ? (
                            <tspan dx="6" fontSize={10} fontWeight={800} opacity={0.95}>
                              {pct}
                            </tspan>
                          ) : null}
                        </text>
                      )
                    }}
                  />
                ))
            })()}

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
              padding={{ right: 60 }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={48}
              tickFormatter={(v: number) => formatCompact(v)}
              // Add some headroom so month-end labels don't collide with the legend.
              domain={[0, (dataMax: number) => (Number.isFinite(dataMax) ? dataMax * 1.12 : 'auto')]}
            />

            {showRunRateBars ? (
              <YAxis
                yAxisId="rr"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={60}
                tickFormatter={(v: number) => formatCompact(v)}
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

            {showRunRateBars ? (
              <Bar
                yAxisId="rr"
                dataKey="rrActual"
                name="Run rate (actual)"
                fill="#94a3b8"
                opacity={0.30}
                barSize={8}
              />
            ) : null}

            {showRunRateBars ? (
              <>
                <Bar
                  yAxisId="rr"
                  dataKey="rrCon"
                  name="Run rate (conservative)"
                  fill="#f97316"
                  opacity={0.20}
                  barSize={8}
                  stackId="rrRange"
                />
                <Bar
                  yAxisId="rr"
                  dataKey="rrBaseExtra"
                  name="Run rate (baseline)"
                  fill="#2563eb"
                  opacity={0.20}
                  barSize={8}
                  stackId="rrRange"
                />
                <Bar
                  yAxisId="rr"
                  dataKey="rrOptExtra"
                  name="Run rate (optimistic)"
                  fill="#16a34a"
                  opacity={0.20}
                  barSize={8}
                  stackId="rrRange"
                />
              </>
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

      <div className="mt-2 text-[11px] text-slate-500">
        Shaded region indicates the forecast window (tomorrow through month-end). The baseline uses
        observed weekday/weekend/bank-holiday run rates and is adjusted by learned intra-month
        seasonality from historical data (dummy for now).
      </div>
    </div>
  )
}

