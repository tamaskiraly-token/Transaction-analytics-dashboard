import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Row = { day: number; multiplier: number }

export function SeasonalityChart(props: {
  title: string
  subtitle?: string
  dayOfMonthMultiplier: number[]
}) {
  const data: Row[] = props.dayOfMonthMultiplier.map((m, i) => ({
    day: i + 1,
    multiplier: m,
  }))

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-500">Average normalized to 1.00×</div>
      </div>

      <div className="mt-3 h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              interval="preserveStartEnd"
              tickFormatter={(d: number) => `${d}`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={48}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `${v.toFixed(2)}×`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              }}
              labelFormatter={(day) => `Day ${day}`}
              formatter={(value: unknown) =>
                typeof value === 'number' ? [`${value.toFixed(3)}×`, 'Multiplier'] : [String(value), 'Multiplier']
              }
            />
            <Line
              type="monotone"
              dataKey="multiplier"
              name="Seasonality"
              stroke="#7c3aed"
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={true}
              animationDuration={650}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-[11px] text-slate-500">
        This curve is learned from historical data by averaging each day-of-month’s share of monthly volume, then
        normalizing so the mean multiplier is 1.00×.
      </div>
    </div>
  )
}

