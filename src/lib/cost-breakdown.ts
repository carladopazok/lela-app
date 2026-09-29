// Per-unit cost components entered by hand in the Products & Inventory "Cost Breakdown" tab.
// Client-safe (no fs) — shared by the storage module, its API routes and ProductsInventory.
export interface CostComponent {
  key: string // stable storage key — never changes, even when the column is renamed or moved
  label: string // column title, editable for every column
  custom?: boolean // user-added column — the only kind that can be deleted
}

// Default order/titles until the layout is first changed (then data/cost-columns.json wins).

export const BUILT_IN_COST_COMPONENTS: readonly CostComponent[] = [
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
]

// { componentKey: € per unit } — built-in keys above plus any custom column keys.
// Missing key = blank (not entered), counted as 0 in the total.
export type CostBreakdownEntry = Record<string, number>

// Sum of the filled components — null when nothing's been entered, so callers can fall back
// to Shopify's "Cost per item" / the manual cost instead of treating it as a €0 product.
// Sums every stored value: the API only accepts known component keys, and deleting a custom
// column strips its values, so nothing stale is left to count.
export function breakdownTotal(entry: CostBreakdownEntry | undefined): number | null {
  if (!entry) return null
  let total = 0
  let any = false
  for (const v of Object.values(entry)) {
    if (typeof v === 'number') {
      total += v
      any = true
    }
  }
  return any ? total : null
}
