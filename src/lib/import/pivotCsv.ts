import Papa from 'papaparse'
import { format, parse } from 'date-fns'
import type { DailyClientTxn, TxnDataset } from '../types'

function slugifyClientId(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return s ? `c_${s}` : `c_unknown`
}

function parseHeaderDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null

  // Your sheet headers look like "01/12/2025" (dd/MM/yyyy).
  const d = parse(t, 'dd/MM/yyyy', new Date())
  if (Number.isNaN(d.getTime())) return null
  return format(d, 'yyyy-MM-dd')
}

function parseNumberish(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v !== 'string') return 0
  const s = v.trim()
  if (!s) return 0
  const n = Number.parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export type PivotImportResult = {
  dataset: TxnDataset
  warnings: string[]
}

/**
 * Imports the Google Sheets layout you described:
 * - Column A: client name
 * - Columns B..: date headers
 * - Cells: daily transaction counts
 *
 * Ignores "Grand Total" and other non-client header rows.
 */
export function importPivotCsv(csvText: string): PivotImportResult {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  })

  const warnings: string[] = []
  if (parsed.errors?.length) warnings.push(...parsed.errors.map((e: Papa.ParseError) => e.message))

  const rows = parsed.data as unknown as string[][]
  if (!rows.length) {
    return {
      dataset: { clients: [], daily: [], bankHolidayDates: [] },
      warnings: ['CSV appears empty.'],
    }
  }

  // Find the row that contains "Row Labels" and date headers.
  const headerRowIdx = rows.findIndex((r) => (r?.[0] ?? '').trim().toLowerCase() === 'row labels')
  if (headerRowIdx === -1) {
    return {
      dataset: { clients: [], daily: [], bankHolidayDates: [] },
      warnings: ['Could not find a header row starting with "Row Labels" in column A.'],
    }
  }

  const headerRow = rows[headerRowIdx]
  const dateCols: { colIdx: number; dateIso: string }[] = []
  for (let i = 1; i < headerRow.length; i++) {
    const iso = parseHeaderDate(headerRow[i] ?? '')
    if (iso) dateCols.push({ colIdx: i, dateIso: iso })
  }

  if (!dateCols.length) {
    return {
      dataset: { clients: [], daily: [], bankHolidayDates: [] },
      warnings: ['No date columns detected. Expected headers like dd/MM/yyyy.'],
    }
  }

  const clientIdByName = new Map<string, string>()
  const clients: { id: string; name: string }[] = []
  const dailyAll: DailyClientTxn[] = []

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const nameRaw = (row?.[0] ?? '').trim()
    if (!nameRaw) continue

    const lower = nameRaw.toLowerCase()
    if (lower === 'grand total') continue
    if (lower === 'count of unique transaction id') continue
    if (lower === 'column labels') continue

    let clientId = clientIdByName.get(nameRaw)
    if (!clientId) {
      clientId = slugifyClientId(nameRaw)
      // Ensure uniqueness if two names slugify to same value.
      let uniqueId = clientId
      let k = 2
      while (clients.some((c) => c.id === uniqueId)) {
        uniqueId = `${clientId}_${k}`
        k++
      }
      clientId = uniqueId
      clientIdByName.set(nameRaw, clientId)
      clients.push({ id: clientId, name: nameRaw })
    }

    for (const dc of dateCols) {
      const v = parseNumberish(row?.[dc.colIdx])
      if (v === 0) continue
      dailyAll.push({ dateIso: dc.dateIso, clientId, txns: Math.round(v) })
    }
  }

  // Split into "current month" vs "historical" for the dashboard model.
  // We keep historicalDaily for seasonality learning. daily contains all data too (safe),
  // but App currently expects current month actuals in `daily`. We'll split to keep it clean.
  const allDates = Array.from(new Set(dailyAll.map((r) => r.dateIso))).sort()
  const latestIso = allDates.at(-1) ?? null
  const latest = latestIso ? new Date(latestIso + 'T00:00:00') : new Date()
  const currentMonthPrefix = format(latest, 'yyyy-MM')

  const daily = dailyAll.filter((r) => r.dateIso.startsWith(currentMonthPrefix))
  const historicalDaily = dailyAll.filter((r) => !r.dateIso.startsWith(currentMonthPrefix))

  return {
    dataset: {
      clients,
      daily,
      historicalDaily,
      bankHolidayDates: [],
    },
    warnings,
  }
}

