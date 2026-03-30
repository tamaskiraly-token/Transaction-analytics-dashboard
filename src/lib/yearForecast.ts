import {
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { dayTypeFor, parseDateOnlyIso, toDateOnlyIso } from './dateUtils'
import type { DayType, TxnDataset } from './types'

export type YearMonthPoint = {
  monthKey: string // yyyy-MM
  label: string // MMM
  actualTotal: number | null
  baselineTotal: number | null
  optimisticTotal: number | null
  conservativeTotal: number | null
  isForecast: boolean
  avgDailyRunRate: number | null
  dayCounts: { weekday: number; weekend: number; holiday: number }
}

export type YearForecastModel = {
  year: number
  months: YearMonthPoint[]
  asOf: { dateIso: string; monthKey: string; currentMonthMtd: number }
  projectionStart: { monthKey: string; ytd: number }
  totals: {
    ytdActual: number
    baselineYearEnd: number | null
    optimisticYearEnd: number | null
    conservativeYearEnd: number | null
  }
  assumptions: {
    lookbackMonths: number
    runRatesAtAsOf: { weekday: number; weekend: number; holiday: number }
    monthlyRunRateGrowthPct: { weekday: number; weekend: number; holiday: number }
  }
}

function sumByDayType(params: {
  monthStart: Date
  monthEnd: Date
  bankHolidaySet: Set<string>
  valueByIso: Map<string, number>
}) {
  const { monthStart, monthEnd, bankHolidaySet, valueByIso } = params
  let wkSum = 0
  let weSum = 0
  let holSum = 0
  let wkN = 0
  let weN = 0
  let holN = 0

  for (let d = monthStart; d <= monthEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const iso = toDateOnlyIso(d)
    const v = valueByIso.get(iso) ?? 0
    const t = dayTypeFor(d, bankHolidaySet)
    if (t === 'holiday') {
      holSum += v
      holN += 1
    } else if (t === 'weekend') {
      weSum += v
      weN += 1
    } else {
      wkSum += v
      wkN += 1
    }
  }

  return {
    sums: { weekday: wkSum, weekend: weSum, holiday: holSum },
    counts: { weekday: wkN, weekend: weN, holiday: holN },
  }
}

function avg(sum: number, n: number) {
  return n > 0 ? sum / n : 0
}

function linearFit(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0] ?? 0 : 0 }
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]!
    const y = ys[i]!
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

export function buildYearForecastModel(params: {
  dataset: TxnDataset
  today: Date
  year: number
  clientId: string
  allowedClientIds?: Set<string>
  bankHolidayDates: string[]
}): YearForecastModel {
  const { dataset, today, year, clientId, allowedClientIds } = params
  const bankHolidaySet = new Set(params.bankHolidayDates)
  const allRows = dataset.historicalDaily ? [...dataset.historicalDaily, ...dataset.daily] : dataset.daily

  // Aggregate daily totals for the selected scope/filter for the entire dataset.
  const daily = new Map<string, number>()
  for (const r of allRows) {
    if (clientId !== 'all' && r.clientId !== clientId) continue
    if (clientId === 'all' && allowedClientIds && !allowedClientIds.has(r.clientId)) continue
    daily.set(r.dateIso, (daily.get(r.dateIso) ?? 0) + r.txns)
  }

  // Determine the as-of date for the current month (latest actual date we have, clamped to today).
  const latestIsoOverall = daily.size ? Array.from(daily.keys()).sort().at(-1) ?? null : null
  const asOf = latestIsoOverall ? parseDateOnlyIso(latestIsoOverall) : today
  const effectiveToday = isBefore(asOf, today) ? asOf : today
  const currentMonthStart = startOfMonth(effectiveToday)
  // const lastFullMonthStart = startOfMonth(subMonths(currentMonthStart, 1))
  const asOfIso = toDateOnlyIso(effectiveToday)
  const asOfMonthKey = format(currentMonthStart, 'yyyy-MM')
  const lastFullMonthStart = startOfMonth(subMonths(currentMonthStart, 1))
  const projectionStartMonthKey = format(lastFullMonthStart, 'yyyy-MM')

  // Compute monthly actual totals for the target year (calendar months).
  const months: YearMonthPoint[] = []
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1)
    const monthEnd = endOfMonth(monthStart)
    const monthKey = format(monthStart, 'yyyy-MM')

    // Sum actuals that fall within this month.
    let actualTotal = 0
    let any = false
    for (let d = monthStart; d <= monthEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = toDateOnlyIso(d)
      if (format(d, 'yyyy') !== String(year)) continue
      if (format(d, 'yyyy-MM') !== monthKey) continue
      const v = daily.get(iso)
      if (v !== undefined) any = true
      actualTotal += v ?? 0
    }

    const dayCounts: { weekday: number; weekend: number; holiday: number } = { weekday: 0, weekend: 0, holiday: 0 }
    for (let d = monthStart; d <= monthEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const t = dayTypeFor(d, bankHolidaySet)
      dayCounts[t] += 1
    }

    // In-year view: show actuals for completed months; scenario starts at current-month as-of point.
    const isActualMonth = isBefore(monthStart, currentMonthStart)
    const isForecast = !isBefore(monthStart, currentMonthStart)

    const dim = Number(format(monthEnd, 'd'))
    const avgDailyRunRate = any ? actualTotal / Math.max(1, dim) : null

    months.push({
      monthKey,
      label: format(monthStart, 'MMM'),
      actualTotal: any && isActualMonth ? Math.round(actualTotal) : null,
      baselineTotal: null,
      optimisticTotal: null,
      conservativeTotal: null,
      isForecast,
      avgDailyRunRate: avgDailyRunRate === null ? null : avgDailyRunRate,
      dayCounts,
    })
  }

  // Build a lookback window of completed months to estimate day-type run rates for MoM projection.
  const lookbackMonths = 6
  const obs: Array<{ monthStart: Date; weekday: number; weekend: number; holiday: number }> = []

  for (let i = 1; i <= 12; i++) {
    const mStart = startOfMonth(subMonths(startOfMonth(effectiveToday), i))
    if (mStart.getFullYear() !== year && mStart.getFullYear() !== year - 1) continue
    const mEnd = endOfMonth(mStart)
    // treat as "completed" if month ended before or on effectiveToday and we have any data in it
    if (!isBefore(mEnd, startOfMonth(effectiveToday))) continue

    const valueByIso = new Map<string, number>()
    let any = false
    for (let d = mStart; d <= mEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = toDateOnlyIso(d)
      const v = daily.get(iso)
      if (v !== undefined) any = true
      valueByIso.set(iso, v ?? 0)
    }
    if (!any) continue

    const { sums, counts } = sumByDayType({ monthStart: mStart, monthEnd: mEnd, bankHolidaySet, valueByIso })
    obs.push({
      monthStart: mStart,
      weekday: avg(sums.weekday, counts.weekday),
      weekend: avg(sums.weekend, counts.weekend),
      holiday: avg(sums.holiday, counts.holiday),
    })
    if (obs.length >= lookbackMonths) break
  }

  // Fit a linear trend for each day-type run rate across months (older -> newer),
  // then extrapolate forward. This produces continuously increasing MoM projections.
  const obsChrono = [...obs].reverse()
  const xs = obsChrono.map((_, i) => i)
  const wkYs = obsChrono.map((o) => o.weekday)
  const weYs = obsChrono.map((o) => o.weekend)
  const holYs = obsChrono.map((o) => o.holiday)

  const wkFit = linearFit(xs, wkYs)
  const weFit = linearFit(xs, weYs)
  const holFit = linearFit(xs, holYs)

  const lastX = xs.length ? xs[xs.length - 1]! : 0
  const rateAt = (fit: { slope: number; intercept: number }, x: number) =>
    Math.max(0, fit.intercept + fit.slope * x)

  const runRatesAtAsOf = {
    weekday: rateAt(wkFit, lastX),
    weekend: rateAt(weFit, lastX),
    holiday: rateAt(holFit, lastX),
  }

  const runRatesNext = {
    weekday: rateAt(wkFit, lastX + 1),
    weekend: rateAt(weFit, lastX + 1),
    holiday: rateAt(holFit, lastX + 1),
  }

  const growthPct = (cur: number, nxt: number) => (cur > 0 ? ((nxt - cur) / cur) * 100 : 0)
  const monthlyRunRateGrowthPct = {
    weekday: growthPct(runRatesAtAsOf.weekday, runRatesNext.weekday),
    weekend: growthPct(runRatesAtAsOf.weekend, runRatesNext.weekend),
    holiday: growthPct(runRatesAtAsOf.holiday, runRatesNext.holiday),
  }

  // Helper to get run rates for a projected month index relative to as-of.
  const monthIndexFromAsOf = (monthStart: Date) => {
    const base = startOfMonth(effectiveToday)
    const dy = monthStart.getFullYear() - base.getFullYear()
    const dm = monthStart.getMonth() - base.getMonth()
    return dy * 12 + dm
  }

  // Compute current-month actual-to-date as the scenario anchor (like in-month chart).
  let currentMonthActualToDate = 0
  for (let d = currentMonthStart; d <= effectiveToday; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    currentMonthActualToDate += daily.get(toDateOnlyIso(d)) ?? 0
  }

  // YTD actual through last completed month + current-month actual-to-date.
  const completedMonthsActual = months
    .filter((m) => !m.isForecast && m.actualTotal !== null)
    .reduce((acc, m) => acc + (m.actualTotal ?? 0), 0)
  const asOfYtd = completedMonthsActual + currentMonthActualToDate
  const projectionStartYtd = completedMonthsActual

  // Project current + future months using the estimated day-type run rates.
  for (const p of months) {
    const mStart = new Date(year, Number(p.monthKey.slice(5, 7)) - 1, 1)
    const mEnd = endOfMonth(mStart)
    const isCurrentMonth = format(mStart, 'yyyy-MM') === format(currentMonthStart, 'yyyy-MM')
    const isFutureMonth = isAfter(mStart, currentMonthStart)
    if (!isCurrentMonth && !isFutureMonth) continue

    // For current month, start from actual total so far and project remaining days.
    const valueByIso = new Map<string, number>()
    for (let d = mStart; d <= mEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = toDateOnlyIso(d)
      valueByIso.set(iso, daily.get(iso) ?? 0)
    }

    const { counts } = sumByDayType({ monthStart: mStart, monthEnd: mEnd, bankHolidaySet, valueByIso })

    let projected = 0
    if (isCurrentMonth) {
      // actual is computed up to effectiveToday; remaining counts are from tomorrow -> month end
      const dayOfMonth = Number(format(effectiveToday, 'd'))
      // recompute remaining counts directly
      const remainingCounts: Record<DayType, number> = { weekday: 0, weekend: 0, holiday: 0 }
      for (
        let d = new Date(effectiveToday.getFullYear(), effectiveToday.getMonth(), effectiveToday.getDate() + 1);
        d <= mEnd;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      ) {
        const t = dayTypeFor(d, bankHolidaySet)
        remainingCounts[t] += 1
      }
      const actualSoFar = currentMonthActualToDate
      const idx = monthIndexFromAsOf(mStart)
      const used = {
        weekday: rateAt(wkFit, lastX + idx),
        weekend: rateAt(weFit, lastX + idx),
        holiday: rateAt(holFit, lastX + idx),
      }
      const remaining =
        remainingCounts.weekday * used.weekday +
        remainingCounts.weekend * used.weekend +
        remainingCounts.holiday * used.holiday
      projected = actualSoFar + remaining
      // keep avgDailyRunRate aligned with actual so far
      p.avgDailyRunRate = dayOfMonth > 0 ? actualSoFar / dayOfMonth : p.avgDailyRunRate
    } else {
      const idx = monthIndexFromAsOf(mStart)
      const used = {
        weekday: rateAt(wkFit, lastX + idx),
        weekend: rateAt(weFit, lastX + idx),
        holiday: rateAt(holFit, lastX + idx),
      }
      projected =
        counts.weekday * used.weekday + counts.weekend * used.weekend + counts.holiday * used.holiday
    }

    const baseline = Math.round(projected)
    p.baselineTotal = baseline
    p.optimisticTotal = Math.round(baseline * 1.1)
    p.conservativeTotal = Math.round(baseline * 0.9)
  }

  const ytdActual = asOfYtd

  const baselineYearEnd = months.reduce((acc, m) => {
    if (acc === null) return m.baselineTotal ?? m.actualTotal ?? 0
    return acc + (m.baselineTotal ?? m.actualTotal ?? 0)
  }, 0 as number | null)

  const optimisticYearEnd = months.reduce((acc, m) => acc + (m.optimisticTotal ?? m.actualTotal ?? 0), 0)
  const conservativeYearEnd = months.reduce((acc, m) => acc + (m.conservativeTotal ?? m.actualTotal ?? 0), 0)

  return {
    year,
    months,
    asOf: { dateIso: asOfIso, monthKey: asOfMonthKey, currentMonthMtd: currentMonthActualToDate },
    projectionStart: { monthKey: projectionStartMonthKey, ytd: projectionStartYtd },
    totals: {
      ytdActual,
      baselineYearEnd: months.some((m) => m.baselineTotal !== null) ? baselineYearEnd : null,
      optimisticYearEnd: months.some((m) => m.optimisticTotal !== null) ? optimisticYearEnd : null,
      conservativeYearEnd: months.some((m) => m.conservativeTotal !== null) ? conservativeYearEnd : null,
    },
    assumptions: { lookbackMonths, runRatesAtAsOf, monthlyRunRateGrowthPct },
  }
}

