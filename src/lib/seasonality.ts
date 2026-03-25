import { endOfMonth, format, parseISO } from 'date-fns'
import { parseDateOnlyIso } from './dateUtils'
import type { DailyClientTxn } from './types'

export type SeasonalityProfile = {
  /**
   * Multipliers by day-of-month (1-indexed).
   * Values are normalized such that the average is ~1.0 across the month.
   */
  dayOfMonthMultiplier: number[]
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
export function buildSeasonalityProfile(history: DailyClientTxn[]): SeasonalityProfile | null {
  if (!history.length) return null

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

    for (const [iso, v] of dailyTotals) {
      const d = parseDateOnlyIso(iso)
      const dom = Number(format(d, 'd'))
      if (dom >= 1 && dom <= dim) {
        domTotals[dom - 1] += v
        domCounts[dom - 1] += 1
      }
    }

    // Compute per-DOM average for this month, then normalize by month mean.
    const domAvg = domTotals.map((t, i) => (domCounts[i] ? t / domCounts[i] : 0))
    const domAvgNorm = normalizeToMean1(domAvg.map((x) => (x === 0 ? NaN : x))).map((x) =>
      Number.isFinite(x) ? x : 1,
    )

    // Accumulate into global profile (variable month lengths handled by overlap).
    for (let i = 0; i < domAvgNorm.length; i++) {
      multipliersByDom[i] = (multipliersByDom[i] ?? 0) + domAvgNorm[i]
    }
    monthsUsed += 1
  }

  if (!monthsUsed) return null
  const avg = multipliersByDom.map((x) => x / monthsUsed)
  return { dayOfMonthMultiplier: normalizeToMean1(avg) }
}

export function seasonalityMultiplierForDom(
  profile: SeasonalityProfile | null,
  dayOfMonth: number,
): number {
  if (!profile) return 1
  const v = profile.dayOfMonthMultiplier[dayOfMonth - 1]
  return Number.isFinite(v) && v > 0 ? v : 1
}

