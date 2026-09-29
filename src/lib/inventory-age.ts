import type { ProductSummary } from '@/types'
import { daysSince } from '@/lib/product-metrics'

// Inventory age = days the current stock has been sitting: since the last detected restock
// (see inventory-snapshots-storage.ts), or since the product's Date Added when no restock has
// been seen. A product still in stock past SLOW_MOVER_DAYS is flagged as a possible slow mover.
export const SLOW_MOVER_DAYS = 120

type AgeFields = Pick<ProductSummary, 'createdAt' | 'lastRestockedAt' | 'inventoryQuantity'>

export function inventoryAgeDays(p: AgeFields): number | null {
  const reference = p.lastRestockedAt ?? p.createdAt
  return reference ? daysSince(reference) : null
}

export function isSlowMover(p: AgeFields): boolean {
  const age = inventoryAgeDays(p)
  return age != null && age > SLOW_MOVER_DAYS && (p.inventoryQuantity ?? 0) > 0
}

// Deeper discount the longer stock has sat.
export function baseSlowMoverDiscountPct(ageDays: number): number {
  if (ageDays >= 270) return 35
  if (ageDays >= 180) return 25
  return 15
}

export interface SlowMoverSuggestion {
  pct: number // whole-number % to suggest; 0 = no room within the margin floor
  basePct: number // the age-tier % before any floor cap
  cappedByFloor: boolean
  costUnknown: boolean // no cost → the floor can't be checked, base % suggested as-is
}

// Age-tier discount, capped at the largest discount that keeps margin at or above the
// product's floor (maxDiscountForFloor, as a 0–1 fraction), rounded DOWN to a multiple of 5.
export function suggestSlowMoverDiscount(ageDays: number, maxOffForFloor: number | null): SlowMoverSuggestion {
  const basePct = baseSlowMoverDiscountPct(ageDays)
  if (maxOffForFloor == null) return { pct: basePct, basePct, cappedByFloor: false, costUnknown: true }
  const capPct = Math.floor((maxOffForFloor * 100) / 5) * 5
  return capPct < basePct
    ? { pct: Math.max(0, capPct), basePct, cappedByFloor: true, costUnknown: false }
    : { pct: basePct, basePct, cappedByFloor: false, costUnknown: false }
}
