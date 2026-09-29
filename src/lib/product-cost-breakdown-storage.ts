import fs from 'fs'
import path from 'path'
import type { CostBreakdownEntry } from '@/lib/cost-breakdown'

const FILE = path.join(process.cwd(), 'data', 'product-cost-breakdown.json')

// { "8123456789": { "fabric": 4.5, "shipping": 3 }, ... } — keyed by Shopify product id, each
// value a per-unit € amount. Only written when the Cost Breakdown tab's "Save" is clicked.
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
