import clsx from 'clsx'
import type { ProjectionBreakdownRow } from '../lib/forecast'

function fmtInt(n: number) {
  return Math.round(n).toLocaleString()
}

export function ProjectionBreakdownTable(props: {
  title: string
  subtitle?: string
  rows: ProjectionBreakdownRow[]
}) {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-500">Forecast window only (tomorrow → month-end)</div>
      </div>

      <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-[980px] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-[120px] border-b border-slate-200 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Date
              </th>
              <th className="w-[120px] border-b border-slate-200 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Day type
              </th>
              <th className="w-[140px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Run rate used
              </th>
              <th className="w-[160px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Seasonality
              </th>
              <th className="w-[120px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Weight %
              </th>
              <th className="w-[140px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Baseline
              </th>
              <th className="w-[140px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Optimistic
              </th>
              <th className="w-[140px] border-b border-slate-200 px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Conservative
              </th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.dateIso} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{r.dateIso}</td>
                <td className="px-4 py-2 text-slate-700">
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                      r.dayType === 'weekday' && 'bg-slate-100 text-slate-700',
                      r.dayType === 'weekend' && 'bg-indigo-50 text-indigo-700',
                      r.dayType === 'holiday' && 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {r.dayType}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtInt(r.runRateUsed)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {r.seasonalityMultiplier.toFixed(3)}×
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.weightPct.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                  {fmtInt(r.baselineTxns)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">
                  {fmtInt(r.optimisticTxns)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-orange-700">
                  {fmtInt(r.conservativeTxns)}
                </td>
              </tr>
            ))}

            {props.rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={8}>
                  No projection rows (either not in current month, or there are no remaining days in the month).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

