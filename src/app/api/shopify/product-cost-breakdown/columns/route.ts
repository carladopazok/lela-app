import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  readCostColumns, writeCostColumns, readProductCostBreakdown, writeProductCostBreakdown,
} from '@/lib/product-cost-breakdown-storage'
import type { CostComponent } from '@/lib/cost-breakdown'

// Every handler returns the full ordered layout as { columns } so the client just replaces its copy.

function validateLabel(label: unknown, columns: CostComponent[], ignoreKey?: string): string | { error: string } {
  const name = typeof label === 'string' ? label.trim() : ''
  if (!name || name.length > 40) return { error: 'Column name must be 1–40 characters' }
  const taken = columns.some((c) => c.key !== ignoreKey && c.label.toLowerCase() === name.toLowerCase())
  if (taken) return { error: `A "${name}" column already exists` }
  return name
}

// Add a custom column: { label, index? } — inserted at `index` (0-based), appended if omitted.
export async function POST(req: NextRequest) {
  const { label, index } = await req.json()
  const columns = readCostColumns()
  const name = validateLabel(label, columns)
  if (typeof name !== 'string') return NextResponse.json(name, { status: 400 })
  const at = Number.isInteger(index) ? Math.max(0, Math.min(columns.length, index)) : columns.length
  // Opaque key, not derived from the label, so renaming never orphans stored values.
  columns.splice(at, 0, { key: `c_${randomBytes(4).toString('hex')}`, label: name, custom: true })
  writeCostColumns(columns)
  return NextResponse.json({ columns })
}

// Rename any column (built-in or custom): { key, label }. Only the title changes — the storage
// key stays the same, so every product's values in that column are kept.
export async function PATCH(req: NextRequest) {
  const { key, label } = await req.json()
  const columns = readCostColumns()
  const column = columns.find((c) => c.key === key)
  if (!column) return NextResponse.json({ error: 'Unknown column' }, { status: 400 })
  const name = validateLabel(label, columns, key)
  if (typeof name !== 'string') return NextResponse.json(name, { status: 400 })
  column.label = name
  writeCostColumns(columns)
  return NextResponse.json({ columns })
}

// Reorder: { order: string[] } — must contain every current column key exactly once.
export async function PUT(req: NextRequest) {
  const { order } = await req.json()
  const columns = readCostColumns()
  const byKey = new Map(columns.map((c) => [c.key, c]))
  if (
    !Array.isArray(order) || order.length !== columns.length ||
    new Set(order).size !== order.length || !order.every((k) => byKey.has(k))
  ) {
    return NextResponse.json({ error: 'order must list every column exactly once' }, { status: 400 })
  }
  const next = order.map((k: string) => byKey.get(k) as CostComponent)
  writeCostColumns(next)
  return NextResponse.json({ columns: next })
}

// Delete a custom column and every product's value in it: { key } → { columns, breakdown }
export async function DELETE(req: NextRequest) {
  const { key } = await req.json()
  const columns = readCostColumns()
  if (!columns.some((c) => c.key === key && c.custom)) {
    return NextResponse.json({ error: 'Only custom columns can be deleted' }, { status: 400 })
  }
  const next = columns.filter((c) => c.key !== key)
  writeCostColumns(next)

  const breakdown = readProductCostBreakdown()
  for (const [productId, entry] of Object.entries(breakdown)) {
    delete entry[key]
    if (Object.keys(entry).length === 0) delete breakdown[productId]
  }
  writeProductCostBreakdown(breakdown)
  return NextResponse.json({ columns: next, breakdown })
}
