// Per-unit cost components entered by hand in the Products & Inventory "Cost Breakdown" tab.
// Client-safe (no fs) — shared by the storage module, its API route and ProductsInventory.
export const COST_COMPONENTS = [
  { key: 'fabric', label: 'Fabric' },
  { key: 'beads', label: 'Beads' },
  { key: 'garment', label: 'Garment' },
  { key: 'printing', label: 'Printing' },
  { key: 'painting', label: 'Painting' },
  { key: 'canvas', label: 'Canvas' },
  { key: 'label', label: 'Label' },
  { key: 'handWork', label: 'Hand work' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'shopifyMonthly', label: 'Shopify Monthly' },
] as const

export type CostComponentKey = (typeof COST_COMPONENTS)[number]['key']

// Missing key = blank (not entered), counted as 0 in the total.
export type CostBreakdownEntry = Partial<Record<CostComponentKey, number>>

export const COST_COMPONENT_KEYS: readonly CostComponentKey[] = COST_COMPONENTS.map((c) => c.key)

// Sum of the filled components — null when nothing's been entered, so callers can fall back
// to Shopify's "Cost per item" / the manual cost instead of treating it as a €0 product.
export function breakdownTotal(entry: CostBreakdownEntry | undefined): number | null {
  if (!entry) return null
  let total = 0
  let any = false
  for (const key of COST_COMPONENT_KEYS) {
    const v = entry[key]
    if (typeof v === 'number') {
      total += v
      any = true
    }
  }
  return any ? total : null
}
