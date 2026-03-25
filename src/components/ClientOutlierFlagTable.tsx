import { addDays, endOfMonth, format, startOfMonth, subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { dayTypeFor, parseDateOnlyIso, toDateOnlyIso } from '../lib/dateUtils'
import type { DailyClientTxn } from '../lib/types'

type Flag = {
  kind: 'neg' | 'pos' | 'none'
  actual: number | null
  expected: number | null
  ratio: number | null
}

type Callout = {
  key: string
  kind: 'neg' | 'pos'
  clientName: string
  dateIso: string
  actual: number
  expected: number | null
  ratio: number | null
  anchor: { left: number; top: number; width: number; height: number }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) return s[mid] ?? null
  const a = s[mid - 1]
  const b = s[mid]
  if (a === undefined || b === undefined) return null
  return (a + b) / 2
}

function mad(xs: number[], med: number): number {
  const dev = xs.map((x) => Math.abs(x - med))
  const m = median(dev)
  return m ?? 0
}

export function ClientOutlierFlagTable(props: {
  title: string
  subtitle?: string
  monthEnd: Date
  asOfIso: string
  clients: { id: string; name: string }[]
  rows: DailyClientTxn[]
  bankHolidayDates: string[]
}) {
  const monthStart = startOfMonth(props.monthEnd)
  const monthEnd = endOfMonth(props.monthEnd)
  const asOf = parseDateOnlyIso(props.asOfIso)

  const bankHolidaySet = useMemo(() => new Set(props.bankHolidayDates), [props.bankHolidayDates])

  const days = useMemo(() => {
    const out: { iso: string; label: string }[] = []
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
      out.push({ iso: toDateOnlyIso(d), label: format(d, 'd') })
    }
    return out
  }, [monthEnd.getTime(), monthStart.getTime()])

  const valueByClientDay = useMemo(() => {
    const allowed = new Set(props.clients.map((c) => c.id))
    const monthPrefix = format(monthStart, 'yyyy-MM')
    const map = new Map<string, number>()
    for (const r of props.rows) {
      if (!allowed.has(r.clientId)) continue
      if (!r.dateIso.startsWith(monthPrefix)) continue
      map.set(`${r.clientId}|${r.dateIso}`, (map.get(`${r.clientId}|${r.dateIso}`) ?? 0) + r.txns)
    }
    return map
  }, [props.clients, props.rows, monthStart])

  const historyByClient = useMemo(() => {
    // Build a compact per-client history for the lookback window around this month.
    const allowed = new Set(props.clients.map((c) => c.id))
    const startIso = toDateOnlyIso(subDays(monthStart, 90))
    const endIso = toDateOnlyIso(monthEnd)
    const map = new Map<string, Array<{ iso: string; v: number }>>()
    for (const r of props.rows) {
      if (!allowed.has(r.clientId)) continue
      if (r.dateIso < startIso || r.dateIso > endIso) continue
      const arr = map.get(r.clientId)
      if (arr) arr.push({ iso: r.dateIso, v: r.txns })
      else map.set(r.clientId, [{ iso: r.dateIso, v: r.txns }])
    }
    for (const [, arr] of map) arr.sort((a, b) => a.iso.localeCompare(b.iso))
    return map
  }, [props.clients, props.rows, monthEnd, monthStart])

  const flagsByClientDay = useMemo(() => {
    const lookbackDays = 60
    const maxRefPoints = 12
    const minRefPoints = 5
    const minExpectedForRatio = 25
    const negRatioThreshold = 0.2 // 80% drop
    const posRatioThreshold = 2.0 // 100% spike
    const robustZThreshold = 3.5

    const out = new Map<string, Flag>()

    for (const c of props.clients) {
      const hist = historyByClient.get(c.id) ?? []

      for (const day of days) {
        const d = parseDateOnlyIso(day.iso)
        if (d > asOf) {
          out.set(`${c.id}|${day.iso}`, { kind: 'none', actual: null, expected: null, ratio: null })
          continue
        }

        const actual = valueByClientDay.get(`${c.id}|${day.iso}`) ?? 0
        const dayType = dayTypeFor(d, bankHolidaySet)
        const minIso = toDateOnlyIso(subDays(d, lookbackDays))

        // Reference set: recent same-day-type observations for this client.
        const refs: number[] = []
        for (let i = hist.length - 1; i >= 0; i--) {
          const h = hist[i]
          if (!h) continue
          if (h.iso >= day.iso) continue
          if (h.iso < minIso) break
          const hd = parseDateOnlyIso(h.iso)
          if (dayTypeFor(hd, bankHolidaySet) !== dayType) continue
          refs.push(h.v)
          if (refs.length >= maxRefPoints) break
        }

        if (refs.length < minRefPoints) {
          out.set(`${c.id}|${day.iso}`, { kind: 'none', actual, expected: null, ratio: null })
          continue
        }

        const exp = median(refs) ?? 0
        const ratio = exp > 0 ? actual / exp : null
        const m = exp
        const mMad = mad(refs, m)
        const robustZ = mMad > 0 ? (0.6745 * (actual - m)) / mMad : 0

        let kind: Flag['kind'] = 'none'
        if (m >= minExpectedForRatio && ratio !== null) {
          if (ratio <= negRatioThreshold) kind = 'neg'
          else if (ratio >= posRatioThreshold) kind = 'pos'
        }
        if (kind === 'none' && Math.abs(robustZ) >= robustZThreshold) {
          kind = robustZ < 0 ? 'neg' : 'pos'
        }

        out.set(`${c.id}|${day.iso}`, { kind, actual, expected: m, ratio })
      }
    }

    return out
  }, [asOf, bankHolidaySet, days, historyByClient, props.clients, valueByClientDay])

  const [callout, setCallout] = useState<Callout | null>(null)

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded bg-rose-500/25 ring-1 ring-rose-500/40" />
            Negative outlier
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500/25 ring-1 ring-emerald-500/40" />
            Positive outlier
          </div>
        </div>
      </div>

      <div
        className="relative mt-3 max-h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-white"
        onScroll={() => setCallout(null)}
      >
        <table className="min-w-[900px] table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 top-0 z-30 w-[260px] border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Client
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className="w-[38px] border-b border-l border-slate-200 px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  title={d.iso}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.clients.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-1 text-xs font-semibold leading-5 text-slate-800">
                  <div className="truncate whitespace-nowrap" title={c.name}>
                    {c.name}
                  </div>
                </td>
                {days.map((d) => {
                  const f = flagsByClientDay.get(`${c.id}|${d.iso}`) ?? {
                    kind: 'none',
                    actual: null,
                    expected: null,
                    ratio: null,
                  }

                  const bg =
                    f.kind === 'neg'
                      ? 'bg-rose-500/20 ring-1 ring-inset ring-rose-500/40'
                      : f.kind === 'pos'
                        ? 'bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/40'
                        : 'bg-transparent'

                  const isFlag = f.kind === 'neg' || f.kind === 'pos'

                  return (
                    <td key={d.iso} className="relative w-[38px] border-b border-l border-slate-100 p-0">
                      <div
                        className={`absolute inset-y-0 left-1/2 w-[26px] -translate-x-1/2 rounded ${bg} ${isFlag ? 'cursor-pointer' : ''}`}
                        onMouseEnter={(e) => {
                          if (!isFlag || f.actual === null) return
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                          setCallout({
                            key: `${c.id}|${d.iso}`,
                            kind: f.kind === 'neg' ? 'neg' : 'pos',
                            clientName: c.name,
                            dateIso: d.iso,
                            actual: f.actual,
                            expected: f.expected,
                            ratio: f.ratio,
                            anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                          })
                        }}
                        onMouseLeave={() => setCallout(null)}
                      />
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

      <div className="mt-2 text-[11px] text-slate-500">
        Outlier definition (per client, per day): compare the day’s transactions to the client’s recent{' '}
        <span className="font-semibold">same day-type</span> history (weekday/weekend/holiday) using a median baseline.
        We flag a day if it’s an <span className="font-semibold">~80% drop</span> (≤20% of expected), an{' '}
        <span className="font-semibold">~2× spike</span> (≥200% of expected), or a large robust deviation (MAD z-score ≥
        3.5). Future days (after the latest actual) are left blank.
      </div>

      {callout ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          {(() => {
            const pad = 12
            const w = 260

            // Prefer placing left of the hovered cell (like the chart bubble).
            let left = callout.anchor.left - w - 14
            // Start with a reasonable anchor; final height is auto-sized.
            let top = callout.anchor.top - 60 / 2 + callout.anchor.height / 2
            if (left < pad) left = callout.anchor.left + callout.anchor.width + 14
            if (top < pad) top = pad
            if (top > window.innerHeight - pad - 40) top = window.innerHeight - pad - 40

            const accent =
              callout.kind === 'neg'
                ? { dot: '#ef4444', text: '#ef4444' }
                : { dot: '#10b981', text: '#10b981' }

            const valueText = `${Math.round(callout.actual).toLocaleString()} txns`
            const dateText = `As of ${format(parseDateOnlyIso(callout.dateIso), 'MMM d')}`
            const deltaText =
              callout.ratio === null || callout.expected === null
                ? null
                : `${callout.ratio >= 1 ? '+' : ''}${((callout.ratio - 1) * 100).toFixed(0)}% vs expected`

            const expectedText =
              callout.expected === null ? null : `Expected: ${Math.round(callout.expected).toLocaleString()}`

            const anchorX = callout.anchor.left + callout.anchor.width / 2
            const anchorY = callout.anchor.top + callout.anchor.height / 2

            // Connector line: from callout edge toward the hovered cell.
            const lineX1 = left < callout.anchor.left ? left + w : left
            const lineY1 = top + 28
            const lineX2 = anchorX
            const lineY2 = anchorY

            return (
              <>
                <svg className="absolute inset-0 h-full w-full">
                  <line
                    x1={lineX1}
                    y1={lineY1}
                    x2={lineX2}
                    y2={lineY2}
                    stroke="#cbd5e1"
                    strokeWidth={1.5}
                  />
                </svg>
                <div
                  className="absolute rounded-2xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                  style={{ left, top, width: w }}
                >
                  <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {callout.clientName}
                  </div>
                  <div className="px-4 pt-1 text-sm font-extrabold text-slate-900">{valueText}</div>
                  <div className="px-4 pt-0.5 text-xs font-semibold text-slate-500">{dateText}</div>
                  <div className="px-4 pb-3 pt-2 text-xs text-slate-700">
                    {expectedText ? <div>{expectedText}</div> : null}
                    {deltaText ? (
                      <div className="mt-1 flex items-center gap-2 font-semibold" style={{ color: accent.text }}>
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: accent.dot }}
                        />
                        {deltaText}
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      ) : null}
    </div>
  )
}

