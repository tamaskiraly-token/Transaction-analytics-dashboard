import Papa from 'papaparse'

export type ClientStatus = 'existing' | 'new'

export type ClientStatusImportResult = {
  byClientName: Map<string, ClientStatus>
  warnings: string[]
}

function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripTrailingParenCode(name: string): string {
  // Common pattern: "ACI (A00147)" → "ACI"
  return name.replace(/\s*\([^)]*\)\s*$/g, '').trim()
}

function normalizeStatus(raw: string): ClientStatus | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.includes('exist')) return 'existing'
  if (s.includes('new')) return 'new'
  return null
}

/**
 * Imports a mapping sheet (gid=411537134) expected to contain:
 * - a client name column (header contains "client")
 * - a status column (header contains "status")
 *
 * Returns a Map keyed by the client name as it appears in the sheet.
 */
export function importClientStatusCsv(csvText: string): ClientStatusImportResult {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true })
  const warnings: string[] = []
  if (parsed.errors?.length) warnings.push(...parsed.errors.map((e: Papa.ParseError) => e.message))

  const rows = parsed.data as unknown as string[][]
  if (!rows.length) return { byClientName: new Map(), warnings: ['Client status CSV appears empty.'] }

  const header = rows[0].map((c) => (c ?? '').trim().toLowerCase())
  let clientIdx = header.findIndex((h) => h.includes('client'))
  let statusIdx = header.findIndex((h) => h.includes('status'))

  // This sheet is often "headerless" and just contains: clientName,statusLabel
  // e.g. "ACI (A00147),Existing Clients"
  // Detect that case by checking if row0 looks like data.
  const row0LooksLikeData =
    header.length >= 2 &&
    header[0].includes('(') &&
    (header[1].includes('existing') || header[1].includes('new'))

  if (row0LooksLikeData) {
    clientIdx = 0
    statusIdx = 1
  }

  if (clientIdx === -1 || statusIdx === -1) {
    return {
      byClientName: new Map(),
      warnings: [
        'Could not detect client/status columns in client status sheet. Expected either headers containing "client" and "status", or a 2-column headerless CSV: clientName,status.',
      ],
    }
  }

  const byClientName = new Map<string, ClientStatus>()

  const startRow = row0LooksLikeData ? 0 : 1
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i]
    const name = (r?.[clientIdx] ?? '').trim()
    const statusRaw = (r?.[statusIdx] ?? '').trim()
    if (!name) continue
    const st = normalizeStatus(statusRaw)
    if (!st) continue
    const n1 = normalizeClientName(name)
    const n2 = normalizeClientName(stripTrailingParenCode(name))
    byClientName.set(n1, st)
    if (n2 && n2 !== n1) byClientName.set(n2, st)
  }

  if (byClientName.size === 0) {
    warnings.push('Client status mapping imported 0 rows (no usable statuses found).')
  }

  return { byClientName, warnings }
}

