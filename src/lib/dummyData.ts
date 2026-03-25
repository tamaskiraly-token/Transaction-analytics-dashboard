import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { toDateOnlyIso } from './dateUtils'
import type { DailyClientTxn, TxnDataset } from './types'

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seasonalityMultiplier(day: number, daysInMonth: number) {
  // Simple end-of-month uplift curve (dummy stand-in for real historical seasonality).
  const t = day / Math.max(1, daysInMonth)
  if (t < 0.5) return 0.95
  if (t < 0.75) return 1.0
  if (t < 0.9) return 1.08
  return 1.18
}

function dowMultiplier(dow: number) {
  // Weekends tend to be lower for many fintech flows.
  if (dow === 0 || dow === 6) return 0.55
  // Mild midweek strength.
  if (dow === 2 || dow === 3) return 1.05
  return 1.0
}

export function makeDummyDataset(anchorDate = new Date()): TxnDataset {
  const clients = [
    { id: 'c_acme', name: 'Acme Retail' },
    { id: 'c_globex', name: 'Globex' },
    { id: 'c_umbrella', name: 'Umbrella Pay' },
    { id: 'c_initech', name: 'Initech' },
  ]

  const thisMonthStart = startOfMonth(anchorDate)
  const thisMonthEnd = endOfMonth(anchorDate)
  const daysInMonth = Number(format(thisMonthEnd, 'd'))

  // A couple of dummy bank holidays in the current month if they exist.
  const bankHolidayDates: string[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), day)
    // Mark an arbitrary Monday as a "bank holiday" in dummy data.
    if (d.getDay() === 1 && day % 14 === 0) bankHolidayDates.push(toDateOnlyIso(d))
  }

  const daily: DailyClientTxn[] = []
  const rng = mulberry32(42)

  // Only generate actuals up to "today" for this month (rest will be forecasted).
  const today = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())

  for (let d = thisMonthStart; d <= thisMonthEnd; d = addDays(d, 1)) {
    if (d > today) break

    const dom = Number(format(d, 'd'))
    const base = 900 + rng() * 150
    const m = seasonalityMultiplier(dom, daysInMonth) * dowMultiplier(d.getDay())
    const holidayPenalty = bankHolidayDates.includes(toDateOnlyIso(d)) ? 0.35 : 1

    for (const c of clients) {
      const clientScale =
        c.id === 'c_acme' ? 1.0 : c.id === 'c_globex' ? 0.65 : c.id === 'c_umbrella' ? 0.45 : 0.3
      const noise = 0.88 + rng() * 0.24
      const txns = Math.max(0, Math.round(base * m * holidayPenalty * clientScale * noise))
      daily.push({ dateIso: toDateOnlyIso(d), clientId: c.id, txns })
    }
  }

  // Generate 6 historical months of full daily data to derive seasonality.
  const historicalDaily: DailyClientTxn[] = []
  const historyMonths = 6
  for (let i = 1; i <= historyMonths; i++) {
    const month = subMonths(anchorDate, i)
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    const dim = Number(format(end, 'd'))

    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dom = Number(format(d, 'd'))
      const base = 840 + rng() * 170
      const m = seasonalityMultiplier(dom, dim) * dowMultiplier(d.getDay())

      for (const c of clients) {
        const clientScale =
          c.id === 'c_acme' ? 1.0 : c.id === 'c_globex' ? 0.66 : c.id === 'c_umbrella' ? 0.44 : 0.32
        const noise = 0.9 + rng() * 0.25
        const txns = Math.max(0, Math.round(base * m * clientScale * noise))
        historicalDaily.push({ dateIso: toDateOnlyIso(d), clientId: c.id, txns })
      }
    }
  }

  return { clients, daily, bankHolidayDates, historicalDaily }
}

