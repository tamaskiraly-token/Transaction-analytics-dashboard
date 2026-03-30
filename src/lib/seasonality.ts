import { differenceInCalendarDays, endOfMonth, format, parseISO } from 'date-fns'
import { dayTypeFor, parseDateOnlyIso } from './dateUtils'
import type { DailyClientTxn, DayType } from './types'

export type SeasonalityProfile = {
  /**
   * Multipliers by day-of-month (1-indexed).
   * Values are normalized such that the average is ~1.0 across the month.
   */
  dayOfMonthMultiplier: number[]
  /**
   * Multipliers by distance-to-month-end (0 = last day, 1 = second last day, ...).
   * Normalized such that average is ~1.0.
   */
  daysToMonthEndMultiplier: number[]
}

function normalizeToMean1(xs: number[]): number[] {
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  if (!Number.isFinite(mean) || mean === 0) return xs.map(() => 1)
  return xs.map((x) => x / mean)
}

/**
 * Builds a very lightweight intra-month seasonality profile from historical daily totals.
 * It learns "day-of-month" multipliers (e.g., end-of-month uplift).
 */
export function buildSeasonalityProfile(
  history: DailyClientTxn[],
  params?: { bankHolidaySet?: Set<string> },
): SeasonalityProfile | null {
  if (!history.length) return null
  const bankHolidaySet = params?.bankHolidaySet ?? new Set<string>()

  // First aggregate across clients per day for stable day-type baselines.
  const globalDailyTotals = new Map<string, number>()
  for (const r of history) {
    globalDailyTotals.set(r.dateIso, (globalDailyTotals.get(r.dateIso) ?? 0) + r.txns)
  }

  // Compute a global day-type mean to remove weekday/weekend/holiday level effects.
  // This prevents e.g. "month-end fell on Saturday" from dragging down the learned month-end seasonality.
  const globalTypeSums: Record<DayType, number> = { weekday: 0, weekend: 0, holiday: 0 }
  const globalTypeNs: Record<DayType, number> = { weekday: 0, weekend: 0, holiday: 0 }
  for (const [iso, v] of globalDailyTotals) {
    const d = parseDateOnlyIso(iso)
    const t = dayTypeFor(d, bankHolidaySet)
    globalTypeSums[t] += v
    globalTypeNs[t] += 1
  }
  const globalTypeMeans: Record<DayType, number> = {
    weekday: globalTypeNs.weekday ? globalTypeSums.weekday / globalTypeNs.weekday : 0,
    weekend: globalTypeNs.weekend ? globalTypeSums.weekend / globalTypeNs.weekend : 0,
    holiday: globalTypeNs.holiday ? globalTypeSums.holiday / globalTypeNs.holiday : 0,
  }

  // Group by month, then compute each month’s average day value by DOM.
  const byMonth = new Map<string, DailyClientTxn[]>()
  for (const r of history) {
    const d = parseDateOnlyIso(r.dateIso)
    const k = format(d, 'yyyy-MM')
    const arr = byMonth.get(k)
    if (arr) arr.push(r)
    else byMonth.set(k, [r])
  }

  const multipliersByDom: number[] = []
  const multipliersByDaysToEnd: number[] = []
  let monthsUsed = 0

  for (const [, rows] of byMonth) {
    // Aggregate across clients for each day.
    const dailyTotals = new Map<string, number>()
    for (const r of rows) dailyTotals.set(r.dateIso, (dailyTotals.get(r.dateIso) ?? 0) + r.txns)

    const anyIso = rows[0]?.dateIso
    if (!anyIso) continue
    const monthDate = parseISO(anyIso + 'T00:00:00')
    const end = endOfMonth(monthDate)
    const dim = Number(format(end, 'd'))

    const domTotals = new Array(dim).fill(0)
    const domCounts = new Array(dim).fill(0)
    const dteTotals = new Array(dim).fill(0) // days-to-end (0..dim-1)
    const dteCounts = new Array(dim).fill(0)

    for (const [iso, v] of dailyTotals) {
      const d = parseDateOnlyIso(iso)
      const t = dayTypeFor(d, bankHolidaySet)
      // Remove day-type level effect first. If mean is missing, fall back to raw value.
      const denom = globalTypeMeans[t]
      const vAdj = denom > 0 ? v / denom : v
      const dom = Number(format(d, 'd'))
      if (dom >= 1 && dom <= dim) {
        domTotals[dom - 1] += vAdj
        domCounts[dom - 1] += 1
      }
      const daysToEnd = differenceInCalendarDays(end, d)
      if (daysToEnd >= 0 && daysToEnd < dim) {
        dteTotals[daysToEnd] += vAdj
        dteCounts[daysToEnd] += 1
      }
    }

    // Compute per-DOM average for this month, then normalize by month mean.
    const domAvg = domTotals.map((t, i) => (domCounts[i] ? t / domCounts[i] : 0))
    const domAvgNorm = normalizeToMean1(domAvg.map((x) => (x === 0 ? NaN : x))).map((x) =>
      Number.isFinite(x) ? x : 1,
    )

    // Compute per-days-to-end average, normalize by month mean.
    const dteAvg = dteTotals.map((t, i) => (dteCounts[i] ? t / dteCounts[i] : 0))
    const dteAvgNorm = normalizeToMean1(dteAvg.map((x) => (x === 0 ? NaN : x))).map((x) =>
      Number.isFinite(x) ? x : 1,
    )

    // Accumulate into global profile (variable month lengths handled by overlap).
    for (let i = 0; i < domAvgNorm.length; i++) {
      multipliersByDom[i] = (multipliersByDom[i] ?? 0) + domAvgNorm[i]
    }
    for (let i = 0; i < dteAvgNorm.length; i++) {
      multipliersByDaysToEnd[i] = (multipliersByDaysToEnd[i] ?? 0) + dteAvgNorm[i]
    }
    monthsUsed += 1
  }

  if (!monthsUsed) return null
  const avg = multipliersByDom.map((x) => x / monthsUsed)
  const avgDte = multipliersByDaysToEnd.map((x) => x / monthsUsed)
  return {
    dayOfMonthMultiplier: normalizeToMean1(avg),
    daysToMonthEndMultiplier: normalizeToMean1(avgDte),
  }
}

export function seasonalityMultiplierForDom(
  profile: SeasonalityProfile | null,
  dayOfMonth: number,
): number {
  if (!profile) return 1
  const v = profile.dayOfMonthMultiplier[dayOfMonth - 1]
  return Number.isFinite(v) && v > 0 ? v : 1
}

export function seasonalityMultiplierForDaysToEnd(
  profile: SeasonalityProfile | null,
  daysToEnd: number,
): number {
  if (!profile) return 1
  const v = profile.daysToMonthEndMultiplier[daysToEnd]
  return Number.isFinite(v) && v > 0 ? v : 1
}

