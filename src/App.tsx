import { endOfMonth, format, parseISO } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ClientScopeSwitch } from './components/ClientScopeSwitch'
import { KpiCard } from './components/KpiCard'
import { Select } from './components/Select'
import { CumulativeForecastChart } from './components/charts/CumulativeForecastChart'
import { DailyRunRateChart } from './components/charts/DailyRunRateChart'
import { SeasonalityChart } from './components/charts/SeasonalityChart'
import { buildDashboardModel } from './lib/dashboardModel'
import { importClientStatusCsv } from './lib/import/clientStatusCsv'
import { importPivotCsv } from './lib/import/pivotCsv'
import type { TxnDataset } from './lib/types'
import datasetJson from './data/txnDataset.sample.json'
import tokenLogo from './assets/token.png'
import { DailyClientCalendarTable } from './components/DailyClientCalendarTable'
import { ProjectionBreakdownTable } from './components/ProjectionBreakdownTable'

function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripTrailingParenCode(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/g, '').trim()
}

function App() {
  const today = new Date()

  const [scope, setScope] = useState<'company' | 'client'>('company')
  const [selectedClientId, setSelectedClientId] = useState<string>('all')
  const [clientStatus, setClientStatus] = useState<'all' | 'existing' | 'new'>('all')
  const [monthEnd, setMonthEnd] = useState<Date>(endOfMonth(today))
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [didAutoRefresh, setDidAutoRefresh] = useState(false)

  const [dataset, setDataset] = useState<TxnDataset>(() => {
    const fromFile = datasetJson as unknown as TxnDataset
    if (fromFile?.clients?.length && (fromFile.daily?.length || fromFile.historicalDaily?.length)) return fromFile

    try {
      const raw = localStorage.getItem('txnDashboard.dataset.v1')
      if (raw) {
        const parsed = JSON.parse(raw) as TxnDataset
        if (parsed?.clients?.length && (parsed.daily?.length || parsed.historicalDaily?.length)) return parsed
      }
    } catch {
      // ignore
    }

    return { clients: [], daily: [], historicalDaily: [], bankHolidayDates: [] }
  })

  const model = useMemo(() => {
    const clientId = scope === 'company' ? 'all' : selectedClientId

    return buildDashboardModel({
      dataset,
      today,
      monthEnd,
      clientId,
      bankHolidayDates: dataset.bankHolidayDates,
      clientStatusFilter: clientStatus,
    })
  }, [dataset, monthEnd, scope, selectedClientId, today, clientStatus])

  const filteredClients = useMemo(() => {
    const hasAnyStatus = dataset.clients.some((c) => c.status === 'existing' || c.status === 'new')
    return clientStatus === 'all' || !hasAnyStatus
      ? dataset.clients
      : dataset.clients.filter((c) => c.status === clientStatus)
  }, [dataset.clients, clientStatus])

  const visibleClientsForTable = useMemo(() => {
    if (scope === 'client') {
      const c = dataset.clients.find((x) => x.id === selectedClientId)
      return c ? [c] : []
    }
    return filteredClients
  }, [dataset.clients, filteredClients, scope, selectedClientId])

  const clientOptions = useMemo(() => {
    if (scope !== 'client') return [{ value: 'all', label: 'All clients' }]
    const opts: { value: string; label: string }[] = []
    for (const c of filteredClients) opts.push({ value: c.id, label: c.name })
    return opts
  }, [filteredClients, scope])

  useEffect(() => {
    if (scope !== 'client') return
    const allowedIds = new Set(filteredClients.map((c) => c.id))
    if (allowedIds.size === 0) return
    if (!allowedIds.has(selectedClientId)) {
      setSelectedClientId(filteredClients[0]!.id)
    }
  }, [filteredClients, scope, selectedClientId])

  useEffect(() => {
    if (scope !== 'client') {
      // Keep "all" as the stored value for company view.
      setSelectedClientId('all')
      return
    }
    if (filteredClients.length > 0 && selectedClientId === 'all') {
      setSelectedClientId(filteredClients[0]!.id)
    }
  }, [filteredClients, scope, selectedClientId])

  const monthOptions = useMemo(() => {
    const all = dataset.historicalDaily ? [...dataset.historicalDaily, ...dataset.daily] : dataset.daily
    const months = new Map<string, Date>()
    for (const r of all) {
      // r.dateIso is yyyy-MM-dd
      const d = parseISO(r.dateIso + 'T00:00:00')
      const key = format(d, 'yyyy-MM')
      months.set(key, endOfMonth(d))
    }
    const opts = Array.from(months.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, d]) => ({ value: d.toISOString(), label: format(d, 'MMM yyyy') }))
    // Fallback if data is empty
    if (!opts.length) {
      const cur = endOfMonth(today)
      opts.push({ value: cur.toISOString(), label: format(cur, 'MMM yyyy') })
    }
    return opts
  }, [dataset.daily, dataset.historicalDaily, today])

  async function refreshFromGoogleSheets() {
    try {
      setIsRefreshing(true)
      setRefreshError(null)
      const sheetId = '1G4FWwoNB_IKkc061AeyD1VvfP7_vx0T6CzNikGDg00c'
      const gidData = '0'
      const gidStatus = '411537134'
      const urlData = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(
        gidData,
      )}`
      const urlStatus = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(
        gidStatus,
      )}`

      const [resData, resStatus] = await Promise.all([fetch(urlData), fetch(urlStatus)])
      if (!resData.ok) throw new Error(`Failed to fetch data tab (${resData.status})`)
      if (!resStatus.ok) throw new Error(`Failed to fetch status tab (${resStatus.status})`)

      const [csvData, csvStatus] = await Promise.all([resData.text(), resStatus.text()])
      const { dataset: imported, warnings: w1 } = importPivotCsv(csvData)
      const { byClientName, warnings: w2 } = importClientStatusCsv(csvStatus)

      const clientsWithStatus = imported.clients.map((c) => ({
        ...c,
        status:
          byClientName.get(normalizeClientName(c.name)) ??
          byClientName.get(normalizeClientName(stripTrailingParenCode(c.name))) ??
          c.status,
      }))

      const merged: TxnDataset = { ...imported, clients: clientsWithStatus }
      setDataset(merged)
      try {
        localStorage.setItem('txnDashboard.dataset.v1', JSON.stringify(merged))
      } catch {
        // ignore
      }
      // If statuses exist, default to "All" so the user can narrow after refresh.
      // Also ensures we don't accidentally stay on a status that would filter everything.
      setClientStatus('all')
      // Default the month selector to the latest month in the refreshed data.
      const all = merged.historicalDaily ? [...merged.historicalDaily, ...merged.daily] : merged.daily
      const latestIso = all.map((r) => r.dateIso).sort().at(-1) ?? null
      if (latestIso) setMonthEnd(endOfMonth(parseISO(latestIso + 'T00:00:00')))
      const warnings = [...w1, ...w2]
      if (warnings.length) console.warn('Import warnings:', warnings)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  const hasRealData = dataset.clients.length > 0 && (dataset.daily.length > 0 || (dataset.historicalDaily?.length ?? 0) > 0)

  useEffect(() => {
    // Auto-refresh on first open so users don't see dummy/empty data.
    if (didAutoRefresh) return
    setDidAutoRefresh(true)
    if (!hasRealData) void refreshFromGoogleSheets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [didAutoRefresh])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <img
                src={tokenLogo}
                alt="Token"
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white object-cover"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Transaction Analytics
                </div>
                <div className="text-xs text-slate-500">
                  Monthly progression & forecasting dashboard
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Month ends at</span>
                <Select
                  value={monthEnd.toISOString()}
                  options={monthOptions}
                  onChange={(v) => setMonthEnd(new Date(v))}
                />
              </div>

              <ClientScopeSwitch value={scope} onChange={setScope} />

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Client status</span>
                <Select
                  value={clientStatus}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'existing', label: 'Existing clients' },
                    { value: 'new', label: 'New clients' },
                  ]}
                  onChange={(v) => setClientStatus(v as 'all' | 'existing' | 'new')}
                />
              </div>

              <div className={clsx('flex items-center gap-2', scope !== 'client' && 'opacity-50')}>
                <span className="text-xs font-medium text-slate-500">Client</span>
                <Select
                  disabled={scope !== 'client'}
                  value={selectedClientId}
                  options={clientOptions}
                  onChange={setSelectedClientId}
                />
              </div>

              <button
                type="button"
                onClick={refreshFromGoogleSheets}
                disabled={isRefreshing}
                className={clsx(
                  'h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm',
                  'hover:bg-slate-50',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {isRefreshing ? 'Refreshing…' : 'Refresh data'}
              </button>
            </div>
          </div>
          {refreshError ? (
            <div className="mt-2 text-xs font-medium text-rose-600">Refresh failed: {refreshError}</div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="card p-6">
          {!hasRealData ? (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Loading data…</div>
              <div className="mt-1 text-xs text-slate-500">
                Fetching the latest data from Google Sheets. If it takes too long, try <span className="font-semibold">Refresh data</span>.
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Monthly transactions</div>
              <div className="text-xs text-slate-500">
                Cumulative actuals vs forecast scenarios. Current state as of{' '}
                <span className="font-medium text-slate-700">{format(today, 'MMM d, yyyy')}</span>.
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard
              title="Month-to-date"
              value={model.kpis.mtdTotal}
              subtitle="Actual transactions"
              deltaLabel="vs baseline month-end"
              deltaValue={model.kpis.mtdVsBaselinePct}
            />
            <KpiCard
              title="Baseline forecast"
              value={model.kpis.baselineTotal}
              subtitle="Expected month-end total"
              deltaLabel="optimistic / conservative"
              deltaValue={`${model.kpis.optimisticTotal.toLocaleString()} / ${model.kpis.conservativeTotal.toLocaleString()}`}
              deltaIsText
            />
            <KpiCard
              title="Run rates observed"
              value={`${Math.round(model.runRates.weekday).toLocaleString()} / ${Math.round(model.runRates.weekend).toLocaleString()}`}
              subtitle="Weekday / weekend avg"
              deltaLabel="bank holiday avg"
              deltaValue={Math.round(model.runRates.holiday).toLocaleString()}
              deltaIsText
            />
          </div>

          <div className="soft-divider my-6" />

          <CumulativeForecastChart
            title="Cumulative progression"
            subtitle={scope === 'company' ? 'Company total' : model.clientLabel}
            data={model.chart}
            todayIso={model.todayIso}
            monthEndIso={model.monthEndIso}
            latestActualBubble={model.latestActualBubble}
          />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <ProjectionBreakdownTable
              title="Projection breakdown (per day)"
              subtitle="Shows the inputs used for the forecast allocation across the remaining calendar days."
              rows={model.projectionBreakdown.rows}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <DailyRunRateChart
              title="Daily run rate"
              subtitle="Observed daily transactions and month-to-date average"
              data={model.chart}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-md">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full table-fixed">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Day type
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        So far
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Left
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">Weekdays</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.weekdaysSoFar}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.weekdaysRemaining}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">Weekends</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.weekendsSoFar}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.weekendsRemaining}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">Bank holidays</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.holidaysSoFar}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {model.classificationCounts.holidaysRemaining}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-1 text-right text-[11px] text-slate-500">
                “Left” counts only cover the forecast window (tomorrow → month-end).
              </div>
            </div>
          </div>

          <div className="soft-divider my-6" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="text-sm font-semibold text-slate-900">Seasonality adjustment</div>
              <div className="mt-1 text-xs text-slate-500">
                We use historical intra-month patterns (e.g. month-end uplift) to shape how the remaining forecast is
                distributed across the remaining days.
              </div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Formula (allocation over remaining days)
                </div>
                <div className="mt-2 font-mono text-[12px] leading-5 text-slate-700">
                  w(d) = runRate(dayType(d)) × seasonality(daysToMonthEnd(d))
                  <br />
                  RemainingTotal = ForecastMonthEnd − ActualMTD
                  <br />
                  Forecast(d) = RemainingTotal × w(d) / Σ w(k) for all remaining days k
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Where <span className="font-semibold">daysToMonthEnd(d)</span> is 0 for the last day of the month, 1
                  for the day before, etc. Seasonality multipliers are mean normalized to 1.00×.
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              {model.seasonality ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <SeasonalityChart
                    title="Observed intra-month seasonality (historical)"
                    subtitle="Learned by distance-to-month-end (0 = last day)"
                    mode="daysToMonthEnd"
                    daysToMonthEndMultiplier={model.seasonality.daysToMonthEndMultiplier}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">Observed intra-month seasonality (historical)</div>
                  <div className="mt-1 text-xs text-slate-500">
                    No historical data available, so seasonality is treated as 1.00× for all days.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="soft-divider my-6" />

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <DailyClientCalendarTable
              title="Daily transactions by client"
              subtitle="Calendar-day transaction counts for the selected month (respects Client status and Per client / Company view)."
              monthEnd={monthEnd}
              clients={visibleClientsForTable}
              rows={dataset.historicalDaily ? [...dataset.historicalDaily, ...dataset.daily] : dataset.daily}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
