import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { clampToDayRange, parseDateOnlyIso, toDateOnlyIso } from './dateUtils'
import { aggregateDailyTotals, buildForecastSeries, buildProjectionBreakdown, computeRemainingCounts, computeRunRates, forecastMonthEndTotals } from './forecast'
import { buildSeasonalityProfile } from './seasonality'
import type { TxnDataset } from './types'

export function buildDashboardModel(params: {
  dataset: TxnDataset
  today: Date
  monthEnd: Date
  clientId: string // 'all' means company
  bankHolidayDates: string[]
  clientStatusFilter?: 'all' | 'existing' | 'new'
}) {
  const { dataset, today, monthEnd, clientId, bankHolidayDates } = params
  const clientStatusFilter = params.clientStatusFilter ?? 'all'

  const monthEndD = endOfMonth(monthEnd)
  const monthStartD = startOfMonth(monthEndD)
  // We anchor "today" to the latest available actual data point (not the wall-clock day),
  // otherwise missing days would be treated as 0 actuals and push the forecast start too far.
  const clampedToday = clampToDayRange(today, monthStartD, monthEndD)
  const monthEndIso = toDateOnlyIso(monthEndD)
  const showScenarios = isSameMonth(monthEndD, today)

  const bankHolidaySet = new Set(bankHolidayDates)
  const allRows = dataset.historicalDaily ? [...dataset.historicalDaily, ...dataset.daily] : dataset.daily

  const allowedClientIdsRaw =
    clientStatusFilter === 'all'
      ? undefined
      : new Set(dataset.clients.filter((c) => c.status === clientStatusFilter).map((c) => c.id))
  const allowedClientIds =
    allowedClientIdsRaw && allowedClientIdsRaw.size > 0 ? allowedClientIdsRaw : undefined

  const dailyTotals = aggregateDailyTotals({
    rows: allRows,
    clientId,
    monthEnd: monthEndD,
    allowedClientIds,
  })

  const lastActualIsoInMonth =
    dailyTotals.size > 0 ? Array.from(dailyTotals.keys()).sort().at(-1) ?? null : null
  const effectiveToday =
    lastActualIsoInMonth && lastActualIsoInMonth <= toDateOnlyIso(clampedToday)
      ? parseDateOnlyIso(lastActualIsoInMonth)
      : clampedToday
  const todayIso = toDateOnlyIso(effectiveToday)

  const { runRates, countsSoFar } = computeRunRates({
    dailyTotals,
    monthStart: monthStartD,
    today: effectiveToday,
    bankHolidaySet,
  })

  const remaining = computeRemainingCounts({ today: effectiveToday, monthEnd: monthEndD, bankHolidaySet })

  const actualMtd = Array.from(dailyTotals.entries())
    .filter(([iso]) => iso <= todayIso)
    .reduce((acc, [, v]) => acc + v, 0)

  const totals = forecastMonthEndTotals({ actualMtd, runRates, remaining })

  const prevMonthEnd = endOfMonth(subMonths(monthEndD, 1))
  const prevMonthStart = startOfMonth(prevMonthEnd)
  const todayDom = Number(format(effectiveToday, 'd'))
  const prevMonthDim = Number(format(prevMonthEnd, 'd'))
  const prevMonthCutoff = new Date(
    prevMonthStart.getFullYear(),
    prevMonthStart.getMonth(),
    Math.min(todayDom, prevMonthDim),
  )
  const prevMonthCutoffIso = toDateOnlyIso(prevMonthCutoff)

  const prevMonthMtd = dataset.historicalDaily
    ? (() => {
        const prevTotals = aggregateDailyTotals({
          rows: dataset.historicalDaily,
          clientId,
          monthEnd: prevMonthEnd,
          allowedClientIds,
        })
        return Array.from(prevTotals.entries())
          .filter(([iso]) => iso <= prevMonthCutoffIso)
          .reduce((acc, [, v]) => acc + v, 0)
      })()
    : null

  const prevMonthTotal = dataset.historicalDaily
    ? (() => {
        const prevTotals = aggregateDailyTotals({
          rows: dataset.historicalDaily,
          clientId,
          monthEnd: prevMonthEnd,
          allowedClientIds,
        })
        return Array.from(prevTotals.values()).reduce((acc, v) => acc + v, 0)
      })()
    : null

  const mtdVsPrevMonthPct =
    prevMonthMtd && prevMonthMtd > 0 ? ((actualMtd - prevMonthMtd) / prevMonthMtd) * 100 : null
  const baselineVsPrevMonthPct =
    prevMonthTotal && prevMonthTotal > 0 ? ((totals.baselineTotal - prevMonthTotal) / prevMonthTotal) * 100 : null
  const optimisticVsPrevMonthPct =
    prevMonthTotal && prevMonthTotal > 0 ? ((totals.optimisticTotal - prevMonthTotal) / prevMonthTotal) * 100 : null
  const conservativeVsPrevMonthPct =
    prevMonthTotal && prevMonthTotal > 0 ? ((totals.conservativeTotal - prevMonthTotal) / prevMonthTotal) * 100 : null

  const seasonality = dataset.historicalDaily
    ? buildSeasonalityProfile(
        dataset.historicalDaily.filter((r) => (clientId === 'all' ? true : r.clientId === clientId)),
      )
    : null

  const projectionBreakdown = showScenarios
    ? buildProjectionBreakdown({
        today: effectiveToday,
        monthEnd: monthEndD,
        bankHolidaySet,
        runRates,
        seasonality,
        actualMtd,
        totals,
      })
    : { rows: [], totals: { baselineRemaining: 0, optimisticRemaining: 0, conservativeRemaining: 0 } }

  const chart = buildForecastSeries({
    dailyTotals,
    today: effectiveToday,
    monthEnd: monthEndD,
    bankHolidaySet,
    runRates,
    totals,
    seasonality,
    showScenarios,
  })

  const clientLabel =
    clientId === 'all' ? 'Company total' : dataset.clients.find((c) => c.id === clientId)?.name ?? clientId

  const baselineVsMtd = totals.baselineTotal > 0 ? (actualMtd / totals.baselineTotal) * 100 : 0

  return {
    todayIso,
    monthEndIso,
    clientLabel,
    chart,
    showScenarios,
    projectionBreakdown,
    scenarioVsLastMonthPct: {
      baseline: baselineVsPrevMonthPct,
      optimistic: optimisticVsPrevMonthPct,
      conservative: conservativeVsPrevMonthPct,
    },
    latestActualBubble: {
      dateIso: todayIso,
      mtd: Math.round(actualMtd),
      prevMonthMtd: prevMonthMtd === null ? null : Math.round(prevMonthMtd),
      mtdVsPrevMonthPct: mtdVsPrevMonthPct === null ? null : mtdVsPrevMonthPct,
    },
    seasonality: seasonality
      ? {
          dayOfMonthMultiplier: seasonality.dayOfMonthMultiplier,
          daysToMonthEndMultiplier: seasonality.daysToMonthEndMultiplier,
        }
      : null,
    runRates,
    classificationCounts: { ...countsSoFar, ...remaining },
    kpis: {
      mtdTotal: Math.round(actualMtd),
      baselineTotal: totals.baselineTotal,
      optimisticTotal: totals.optimisticTotal,
      conservativeTotal: totals.conservativeTotal,
      mtdVsBaselinePct: `${baselineVsMtd.toFixed(1)}%`,
    },
  }
}

