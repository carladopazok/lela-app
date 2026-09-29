// Discount floor: the minimum acceptable margin % per product. A discount or markdown that
// would push margin below it gets a warning (never a block) everywhere a discount is set.
// Client-safe (no fs) — shared by the storage module, its route and ProductsInventory.
export const DEFAULT_MARGIN_FLOOR_PCT = 10

// { productId: floorPct } — only products whose floor differs from the default are stored.
export type MarginFloors = Record<string, number>

export function marginFloorFor(floors: MarginFloors, productId: number | null | undefined): number {
  if (productId == null) return DEFAULT_MARGIN_FLOOR_PCT
  return floors[String(productId)] ?? DEFAULT_MARGIN_FLOOR_PCT
}

// Largest discount (as a fraction, 0–1) that keeps margin % at or above the floor:
//   price·(1−d) − cost ≥ floor·price·(1−d)  ⇔  d ≤ 1 − cost / (price·(1 − floor))
// 0 when even full price is already below the floor; null when price or cost is unknown.
export function maxDiscountForFloor(price: number | null, cost: number | null, floorPct: number): number | null {
  if (price == null || cost == null || price <= 0 || floorPct >= 100) return null
  const d = 1 - cost / (price * (1 - floorPct / 100))
  return Math.max(0, Math.min(1, d))
}

export function isBelowFloor(margin: { percent: number } | null, floorPct: number): boolean {
  return margin != null && margin.percent < floorPct - 1e-9
}
