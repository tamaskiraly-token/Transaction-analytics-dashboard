import { addDays, endOfMonth, format, startOfMonth } from 'date-fns'
import { useMemo } from 'react'
import type { DailyClientTxn } from '../lib/types'

function formatCell(n: number) {
  return n === 0 ? '' : n.toLocaleString()
}

export function DailyClientCalendarTable(props: {
  title: string
  subtitle?: string
  monthEnd: Date
  clients: { id: string; name: string }[]
  rows: DailyClientTxn[]
}) {
  const monthStart = startOfMonth(props.monthEnd)
  const monthEnd = endOfMonth(props.monthEnd)

  const days = useMemo(() => {
    const out: { iso: string; label: string }[] = []
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
      out.push({ iso: format(d, 'yyyy-MM-dd'), label: format(d, 'd') })
    }
    return out
  }, [monthEnd.getTime(), monthStart.getTime()])

  const valueByClientDay = useMemo(() => {
    const map = new Map<string, number>()
    const allowed = new Set(props.clients.map((c) => c.id))
    const monthPrefix = format(monthStart, 'yyyy-MM')
    for (const r of props.rows) {
      if (!allowed.has(r.clientId)) continue
      if (!r.dateIso.startsWith(monthPrefix)) continue
      map.set(`${r.clientId}|${r.dateIso}`, (map.get(`${r.clientId}|${r.dateIso}`) ?? 0) + r.txns)
    }
    return map
  }, [props.clients, props.rows, monthStart])

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-500">
          {format(monthStart, 'MMM yyyy')} daily counts (scroll)
        </div>
      </div>

      <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-[900px] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 w-[260px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Client
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className="w-[52px] border-b border-slate-200 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  title={d.iso}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.clients.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-2 font-medium text-slate-800">
                  {c.name}
                </td>
                {days.map((d) => {
                  const v = valueByClientDay.get(`${c.id}|${d.iso}`) ?? 0
                  return (
                    <td
                      key={d.iso}
                      className="px-2 py-2 text-right tabular-nums text-slate-700"
                      title={v ? v.toLocaleString() : ''}
                    >
                      {formatCell(v)}
                    </td>
                  )
                })}
              </tr>
            ))}

            {props.clients.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={days.length + 1}>
                  No clients match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

