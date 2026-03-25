import { addDays, differenceInCalendarDays, endOfMonth, startOfMonth } from 'date-fns'
import { clampToDayRange, dayTypeFor, parseDateOnlyIso, toDateOnlyIso } from './dateUtils'
import { seasonalityMultiplierForDaysToEnd, type SeasonalityProfile } from './seasonality'
import type { DayType, DailyClientTxn } from './types'

export type RunRates = {
  weekday: number
  weekend: number
  holiday: number
}

export type DayClassificationCounts = {
  weekdaysSoFar: number
  weekendsSoFar: number
  holidaysSoFar: number
  weekdaysRemaining: number
  weekendsRemaining: number
  holidaysRemaining: number
}

export type ForecastTotals = {
  baselineTotal: number
  optimisticTotal: number
  conservativeTotal: number
}

export type ForecastPoint = {
  dateIso: string
  actualCumulative: number | null
  baselineCumulative: number | null
  optimisticCumulative: number | null
  conservativeCumulative: number | null
  isForecast: boolean
}

export type ProjectionBreakdownRow = {
  dateIso: string
  dayType: DayType
  runRateUsed: number
  seasonalityMultiplier: number
  weight: number
  weightPct: number
  baselineTxns: number
  optimisticTxns: number
  conservativeTxns: number
}

export type ProjectionBreakdown = {
  rows: ProjectionBreakdownRow[]
  totals: {
    baselineRemaining: number
    optimisticRemaining: number
    conservativeRemaining: number
  }
}

function safeAvg(sum: number, n: number) {
  if (n <= 0) return 0
  return sum / n
}

export function computeRunRates(params: {
  dailyTotals: Map<string, number>
  monthStart: Date
  today: Date
  bankHolidaySet: Set<string>
}): { runRates: RunRates; countsSoFar: Pick<DayClassificationCounts, 'weekdaysSoFar' | 'weekendsSoFar' | 'holidaysSoFar'> } {
  const { dailyTotals, monthStart, today, bankHolidaySet } = params

  let wkSum = 0
  let weSum = 0
  let holSum = 0
  let wkN = 0
  let weN = 0
  let holN = 0

  for (let d = monthStart; d <= today; d = addDays(d, 1)) {
    const iso = toDateOnlyIso(d)
    const v = dailyTotals.get(iso) ?? 0
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
    runRates: {
      weekday: safeAvg(wkSum, wkN),
      weekend: safeAvg(weSum, weN),
      holiday: safeAvg(holSum, holN),
    },
    countsSoFar: { weekdaysSoFar: wkN, weekendsSoFar: weN, holidaysSoFar: holN },
  }
}

export function computeRemainingCounts(params: {
  today: Date
  monthEnd: Date
  bankHolidaySet: Set<string>
}): Pick<DayClassificationCounts, 'weekdaysRemaining' | 'weekendsRemaining' | 'holidaysRemaining'> {
  const { today, monthEnd, bankHolidaySet } = params
  let wk = 0
  let we = 0
  let hol = 0

  for (let d = addDays(today, 1); d <= monthEnd; d = addDays(d, 1)) {
    const t = dayTypeFor(d, bankHolidaySet)
    if (t === 'holiday') hol += 1
    else if (t === 'weekend') we += 1
    else wk += 1
  }

  return { weekdaysRemaining: wk, weekendsRemaining: we, holidaysRemaining: hol }
}

export function forecastMonthEndTotals(params: {
  actualMtd: number
  runRates: RunRates
  remaining: Pick<DayClassificationCounts, 'weekdaysRemaining' | 'weekendsRemaining' | 'holidaysRemaining'>
}): ForecastTotals {
  const { actualMtd, runRates, remaining } = params
  const remainingExpected =
    remaining.weekdaysRemaining * runRates.weekday +
    remaining.weekendsRemaining * runRates.weekend +
    remaining.holidaysRemaining * runRates.holiday

  const baseline = actualMtd + remainingExpected
  const optimistic = baseline * 1.05
  const conservative = baseline * 0.95

  return {
    baselineTotal: Math.round(baseline),
    optimisticTotal: Math.round(optimistic),
    conservativeTotal: Math.round(conservative),
  }
}

function expectedForDay(dayType: DayType, runRates: RunRates) {
  if (dayType === 'holiday') return runRates.holiday
  if (dayType === 'weekend') return runRates.weekend
  return runRates.weekday
}

export function buildProjectionBreakdown(params: {
  today: Date
  monthEnd: Date
  bankHolidaySet: Set<string>
  runRates: RunRates
  seasonality: SeasonalityProfile | null
  actualMtd: number
  totals: ForecastTotals
}): ProjectionBreakdown {
  const { today, monthEnd, bankHolidaySet, runRates, seasonality, actualMtd, totals } = params
  const monthStart = startOfMonth(monthEnd)
  const clampedToday = clampToDayRange(today, monthStart, monthEnd)

  const remainingIsos: string[] = []
  const dayTypes: DayType[] = []
  const runRateUsed: number[] = []
  const seasonals: number[] = []
  const weights: number[] = []

  for (let d = addDays(clampedToday, 1); d <= monthEnd; d = addDays(d, 1)) {
    const iso = toDateOnlyIso(d)
    const t = dayTypeFor(d, bankHolidaySet)
    const rr = expectedForDay(t, runRates)
    const dte = differenceInCalendarDays(monthEnd, d)
    const s = seasonalityMultiplierForDaysToEnd(seasonality, dte)
    const w = Math.max(0, rr * s)

    remainingIsos.push(iso)
    dayTypes.push(t)
    runRateUsed.push(rr)
    seasonals.push(s)
    weights.push(w)
  }

  const wSum = weights.reduce((a, b) => a + b, 0)

  function allocate(targetTotal: number) {
    const remainingTarget = Math.max(0, targetTotal - actualMtd)
    const alloc = new Map<string, number>()
    if (remainingIsos.length === 0) return { alloc, remainingTarget }
    if (wSum <= 0) {
      const perDay = remainingTarget / remainingIsos.length
      for (const iso of remainingIsos) alloc.set(iso, perDay)
      return { alloc, remainingTarget }
    }
    for (let i = 0; i < remainingIsos.length; i++) {
      alloc.set(remainingIsos[i], (weights[i] / wSum) * remainingTarget)
    }
    return { alloc, remainingTarget }
  }

  const base = allocate(totals.baselineTotal)
  const opt = allocate(totals.optimisticTotal)
  const con = allocate(totals.conservativeTotal)

  const rows: ProjectionBreakdownRow[] = []
  for (let i = 0; i < remainingIsos.length; i++) {
    const iso = remainingIsos[i]
    const w = weights[i]
    rows.push({
      dateIso: iso,
      dayType: dayTypes[i]!,
      runRateUsed: runRateUsed[i]!,
      seasonalityMultiplier: seasonals[i]!,
      weight: w,
      weightPct: wSum > 0 ? (w / wSum) * 100 : remainingIsos.length ? 100 / remainingIsos.length : 0,
      baselineTxns: base.alloc.get(iso) ?? 0,
      optimisticTxns: opt.alloc.get(iso) ?? 0,
      conservativeTxns: con.alloc.get(iso) ?? 0,
    })
  }

  return {
    rows,
    totals: {
      baselineRemaining: base.remainingTarget,
      optimisticRemaining: opt.remainingTarget,
      conservativeRemaining: con.remainingTarget,
    },
  }
}

/**
 * Builds a full month time series of cumulative actuals and forecast scenarios.
 * Forecast allocation across remaining days is adjusted by an intra-month seasonality profile if provided.
 */
export function buildForecastSeries(params: {
  dailyTotals: Map<string, number>
  today: Date
  monthEnd: Date
  bankHolidaySet: Set<string>
  runRates: RunRates
  totals: ForecastTotals
  seasonality: SeasonalityProfile | null
  showScenarios?: boolean
}): ForecastPoint[] {
  const { dailyTotals, today, monthEnd, bankHolidaySet, runRates, totals, seasonality } = params
  const showScenarios = params.showScenarios ?? true

  const monthStart = startOfMonth(monthEnd)
  const clampedToday = clampToDayRange(today, monthStart, monthEnd)
  const todayIso = toDateOnlyIso(clampedToday)

  // First compute actual MTD cumulative series.
  let actualCum = 0
  const actualByIso = new Map<string, number>()
  for (let d = monthStart; d <= clampedToday; d = addDays(d, 1)) {
    const iso = toDateOnlyIso(d)
    const v = dailyTotals.get(iso) ?? 0
    actualCum += v
    actualByIso.set(iso, actualCum)
  }
  const actualMtd = actualCum

  if (!showScenarios) {
    const series: ForecastPoint[] = []
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
      const iso = toDateOnlyIso(d)
      series.push({
        dateIso: iso,
        actualCumulative: actualByIso.get(iso) ?? null,
        baselineCumulative: null,
        optimisticCumulative: null,
        conservativeCumulative: null,
        isForecast: false,
      })
    }
    return series
  }

  // Build a list of remaining days and their (run-rate * seasonality) weights.
  const remainingIsos: string[] = []
  const weights: number[] = []

  for (let d = addDays(clampedToday, 1); d <= monthEnd; d = addDays(d, 1)) {
    const iso = toDateOnlyIso(d)
    remainingIsos.push(iso)

    const t = dayTypeFor(d, bankHolidaySet)
    const base = expectedForDay(t, runRates)
    const dte = differenceInCalendarDays(monthEnd, d)
    const seasonal = seasonalityMultiplierForDaysToEnd(seasonality, dte)
    weights.push(Math.max(0, base * seasonal))
  }

  function allocateRemaining(targetTotal: number) {
    const remainingTarget = Math.max(0, targetTotal - actualMtd)
    const wSum = weights.reduce((a, b) => a + b, 0)
    const allocated = new Map<string, number>()
    if (remainingIsos.length === 0) return allocated
    if (wSum <= 0) {
      const perDay = remainingTarget / remainingIsos.length
      for (const iso of remainingIsos) allocated.set(iso, perDay)
      return allocated
    }
    for (let i = 0; i < remainingIsos.length; i++) {
      allocated.set(remainingIsos[i], (weights[i] / wSum) * remainingTarget)
    }
    return allocated
  }

  const baseAlloc = allocateRemaining(totals.baselineTotal)
  const optAlloc = allocateRemaining(totals.optimisticTotal)
  const conAlloc = allocateRemaining(totals.conservativeTotal)

  const series: ForecastPoint[] = []
  let baseCum = 0
  let optCum = 0
  let conCum = 0

  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
    const iso = toDateOnlyIso(d)
    const isForecast = d > clampedToday
    if (!isForecast) {
      const v = dailyTotals.get(iso) ?? 0
      baseCum += v
      optCum += v
      conCum += v
      const isToday = iso === todayIso
      series.push({
        dateIso: iso,
        actualCumulative: actualByIso.get(iso) ?? null,
        // Hide scenario lines where actuals already exist.
        // Keep a single anchor point at "today" so forecast lines start seamlessly.
        baselineCumulative: isToday ? baseCum : null,
        optimisticCumulative: isToday ? optCum : null,
        conservativeCumulative: isToday ? conCum : null,
        isForecast: false,
      })
    } else {
      baseCum += baseAlloc.get(iso) ?? 0
      optCum += optAlloc.get(iso) ?? 0
      conCum += conAlloc.get(iso) ?? 0
      series.push({
        dateIso: iso,
        actualCumulative: null,
        baselineCumulative: baseCum,
        optimisticCumulative: optCum,
        conservativeCumulative: conCum,
        isForecast: true,
      })
    }
  }

  // Ensure exact month-end totals (floating allocation can drift by rounding).
  const last = series.at(-1)
  if (last) {
    last.baselineCumulative = totals.baselineTotal
    last.optimisticCumulative = totals.optimisticTotal
    last.conservativeCumulative = totals.conservativeTotal
  }

  return series
}

export function aggregateDailyTotals(params: {
  rows: DailyClientTxn[]
  clientId: string
  monthEnd: Date
  allowedClientIds?: Set<string>
}): Map<string, number> {
  const { rows, clientId, monthEnd, allowedClientIds } = params
  const monthStart = startOfMonth(monthEnd)
  const monthEndClamped = endOfMonth(monthEnd)
  const totals = new Map<string, number>()

  for (const r of rows) {
    if (clientId !== 'all' && r.clientId !== clientId) continue
    if (clientId === 'all' && allowedClientIds && !allowedClientIds.has(r.clientId)) continue
    const d = parseDateOnlyIso(r.dateIso)
    if (d < monthStart || d > monthEndClamped) continue
    totals.set(r.dateIso, (totals.get(r.dateIso) ?? 0) + r.txns)
  }
  return totals
}

