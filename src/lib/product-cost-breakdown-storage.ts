import fs from 'fs'
import path from 'path'
import { BUILT_IN_COST_COMPONENTS, type CostBreakdownEntry, type CostComponent } from '@/lib/cost-breakdown'

const FILE = path.join(process.cwd(), 'data', 'product-cost-breakdown.json')
const COLUMNS_FILE = path.join(process.cwd(), 'data', 'cost-columns.json')

// { "8123456789": { "fabric": 4.5, "shipping": 3 }, ... } — keyed by Shopify product id, each
// value a per-unit € amount. Only written when the Cost Breakdown tab's "Save" is clicked
// (or when a custom column is deleted, which strips its values).
export function readProductCostBreakdown(): Record<string, CostBreakdownEntry> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductCostBreakdown(data: Record<string, CostBreakdownEntry>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

// Full ordered column layout — built-in and custom columns, with their (editable) titles:
// [{ "key": "fabric", "label": "Fabric" }, { "key": "c_k3j9x2ab", "label": "Zippers", "custom": true }, ...]
// Falls back to the built-in defaults until the layout is first changed. Any built-in missing
// from the stored file (e.g. one added to the code later) is appended so it's never lost.
export function readCostColumns(): CostComponent[] {
  let stored: CostComponent[] = []
  try {
    stored = JSON.parse(fs.readFileSync(COLUMNS_FILE, 'utf8'))
  } catch {
    return [...BUILT_IN_COST_COMPONENTS]
  }
  const keys = new Set(stored.map((c) => c.key))
  return [...stored, ...BUILT_IN_COST_COMPONENTS.filter((c) => !keys.has(c.key))]
}

export function writeCostColumns(data: CostComponent[]): void {
  fs.writeFileSync(COLUMNS_FILE, JSON.stringify(data, null, 2))
}
