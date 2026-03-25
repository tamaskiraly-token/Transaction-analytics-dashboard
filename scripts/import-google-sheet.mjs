import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// Simple CSV fetch + convert into TxnDataset JSON for the app.
// Usage:
//   node scripts/import-google-sheet.mjs "<sheetId>" "<gid>"
// Example:
//   node scripts/import-google-sheet.mjs "1G4FWwoNB_IKkc061AeyD1VvfP7_vx0T6CzNikGDg00c" "0"

const [sheetId, gid = '0'] = process.argv.slice(2)
if (!sheetId) {
  console.error('Missing sheetId. Usage: node scripts/import-google-sheet.mjs "<sheetId>" "<gid>"')
  process.exit(1)
}

const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(
  gid,
)}`

const res = await fetch(exportUrl)
if (!res.ok) {
  console.error(`Failed to fetch CSV (${res.status}). URL: ${exportUrl}`)
  process.exit(1)
}
const csv = await res.text()

// Use the same logic as the app by importing the TS module through node's ESM loader isn't trivial here,
// so we do a minimal dynamic import from the built JS. For now, we inline a small transform by calling
// the Vite TS runtime via ts-node is overkill; instead we emit the CSV and let the app import it later.
// We'll parse using a lightweight approach in the script itself (PapaParse via dependency).
import Papa from 'papaparse'
import { parse, format as fmt } from 'date-fns'

function parseHeaderDate(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const d = parse(t, 'dd/MM/yyyy', new Date())
  if (Number.isNaN(d.getTime())) return null
  return fmt(d, 'yyyy-MM-dd')
}
function slugifyClientId(name) {
  const s = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return s ? `c_${s}` : `c_unknown`
}
function parseNumberish(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const n = Number.parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const parsed = Papa.parse(csv, { skipEmptyLines: true })
const rows = parsed.data
const headerRowIdx = rows.findIndex((r) => String(r?.[0] ?? '').trim().toLowerCase() === 'row labels')
if (headerRowIdx === -1) {
  console.error('Could not find a header row starting with "Row Labels" in column A.')
  process.exit(1)
}

const headerRow = rows[headerRowIdx]
const dateCols = []
for (let i = 1; i < headerRow.length; i++) {
  const iso = parseHeaderDate(headerRow[i])
  if (iso) dateCols.push({ colIdx: i, dateIso: iso })
}
if (!dateCols.length) {
  console.error('No date columns detected. Expected headers like dd/MM/yyyy.')
  process.exit(1)
}

const clientIdByName = new Map()
const clients = []
const dailyAll = []

for (let r = headerRowIdx + 1; r < rows.length; r++) {
  const row = rows[r]
  const nameRaw = String(row?.[0] ?? '').trim()
  if (!nameRaw) continue
  const lower = nameRaw.toLowerCase()
  if (lower === 'grand total' || lower === 'count of unique transaction id' || lower === 'column labels')
    continue

  let clientId = clientIdByName.get(nameRaw)
  if (!clientId) {
    clientId = slugifyClientId(nameRaw)
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

const allDates = Array.from(new Set(dailyAll.map((r) => r.dateIso))).sort()
const latestIso = allDates.at(-1) ?? null
const latest = latestIso ? new Date(latestIso + 'T00:00:00') : new Date()
const currentMonthPrefix = fmt(latest, 'yyyy-MM')

const daily = dailyAll.filter((r) => r.dateIso.startsWith(currentMonthPrefix))
const historicalDaily = dailyAll.filter((r) => !r.dateIso.startsWith(currentMonthPrefix))

const dataset = { clients, daily, historicalDaily, bankHolidayDates: [] }

const outPath = path.join(process.cwd(), 'src', 'data', 'txnDataset.json')
await writeFile(outPath, JSON.stringify(dataset, null, 2), 'utf8')
console.log(`Wrote dataset to ${outPath}`)

