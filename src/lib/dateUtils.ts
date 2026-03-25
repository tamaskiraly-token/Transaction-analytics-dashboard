import { endOfDay, format, isAfter, isBefore, isSameDay, startOfDay } from 'date-fns'
import type { DayType } from './types'

export function toDateOnlyIso(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function parseDateOnlyIso(iso: string): Date {
  // Date-fns parseISO treats date-only as midnight UTC, which can shift on Windows.
  // We explicitly build a local date.
  const [y, m, dd] = iso.split('-').map((x) => Number(x))
  return new Date(y, (m ?? 1) - 1, dd ?? 1)
}

export function clampToDayRange(date: Date, min: Date, max: Date): Date {
  const d = startOfDay(date)
  if (isBefore(d, startOfDay(min))) return startOfDay(min)
  if (isAfter(d, startOfDay(max))) return startOfDay(max)
  return d
}

export function dayTypeFor(date: Date, bankHolidaySet: Set<string>): DayType {
  const iso = toDateOnlyIso(date)
  if (bankHolidaySet.has(iso)) return 'holiday'
  const dow = date.getDay()
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday'
}

export function isInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  const d = startOfDay(date)
  const s = startOfDay(start)
  const e = endOfDay(end)
  return !isBefore(d, s) && !isAfter(d, e)
}

export function isSameDayIso(aIso: string, bIso: string): boolean {
  return isSameDay(parseDateOnlyIso(aIso), parseDateOnlyIso(bIso))
}

