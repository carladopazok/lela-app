const DAY_MS = 86_400_000

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS)
}

export function dateRange(start: string, end: string): string[] {
  const days = daysBetween(start, end)
  const out: string[] = []
  for (let i = 0; i <= days; i++) out.push(addDays(start, i))
  return out
}

export function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0 = Sunday
}

export function monthOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCMonth() // 0 = January
}

export function yearMonthOf(dateStr: string): string {
  return dateStr.slice(0, 7) // 'YYYY-MM'
}

export function monthsBetween(fromYearMonth: string, toYearMonth: string): number {
  const [ay, am] = fromYearMonth.split('-').map(Number)
  const [by, bm] = toYearMonth.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

export function daysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const first = `${yearMonth}-01`
  const daysCount = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: daysCount }, (_, i) => addDays(first, i))
}

export function shiftYear(dateStr: string, years: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
