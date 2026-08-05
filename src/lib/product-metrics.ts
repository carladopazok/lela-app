import type { ProductSummary } from '@/types'

export const STALLED_DAYS = 90
export const MIN_UNITS_FOR_RUNWAY = 3
export const LOW_RUNWAY_THRESHOLD_DAYS = 15

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Narrowed to just the fields each function reads (rather than the full ProductSummary)
// so callers that don't have the full catalog/COGS/returns pipeline — e.g. the assistant
// context builder — can still reuse this exact logic instead of re-deriving it.
type StalledFields = Pick<ProductSummary, 'lastSoldAt' | 'publishedAt' | 'createdAt'>
type RunwayFields = Pick<ProductSummary, 'inventoryQuantity' | 'unitsSoldMonth'>

export function isStalled(p: StalledFields, thresholdDays: number): boolean {
  const reference = p.lastSoldAt ?? p.publishedAt ?? p.createdAt
  if (reference == null) return false
  return daysSince(reference) >= thresholdDays
}

export function isSoldOutLive(p: ProductSummary): boolean {
  return p.inventoryQuantity === 0 && p.status === 'active' && p.publishedAt !== null
}

export interface StalledUnitsSummary {
  units: number
  potentialRevenue: number
}

// Portfolio-level opportunity size across ALL stalled products — Σ(price × onHand), full
// price, no audience/conversion cap. This is intentionally NOT the same figure as
// StalledCampaignPanel's per-product potentialRevenue (ProductsInventory.tsx, roughly
// min(audience×conversion, onHand) × discountedPrice) — that answers a different question
// (one product's realistic ceiling for a specific audience). Keep these two separate.
export function getStalledUnitsSummary(products: (StalledFields & Pick<ProductSummary, 'inventoryQuantity' | 'price'>)[]): StalledUnitsSummary {
  const list = products.filter((p) => isStalled(p, STALLED_DAYS))
  const units = list.reduce((s, p) => s + (p.inventoryQuantity ?? 0), 0)
  const potentialRevenue = list.reduce((s, p) => s + (p.price ?? 0) * (p.inventoryQuantity ?? 0), 0)
  return { units, potentialRevenue }
}

// Days until stockout at recent velocity. Requires enough trailing-30-day sales for the
// estimate to mean something (MIN_UNITS_FOR_RUNWAY) — below that, a single stray sale could
// swing the number wildly. Null (not 0, not Infinity) for anything unmeasurable: no catalog
// data, already sold out (covered by isSoldOutLive instead), or too little recent velocity.
export function getRunwayDays(p: RunwayFields): number | null {
  if (p.inventoryQuantity == null || p.inventoryQuantity <= 0) return null
  if (p.unitsSoldMonth < MIN_UNITS_FOR_RUNWAY) return null
  const dailyVelocity = p.unitsSoldMonth / 30
  return Math.round(p.inventoryQuantity / dailyVelocity)
}

export function isLowRunway(p: RunwayFields): boolean {
  const runway = getRunwayDays(p)
  return runway != null && runway < LOW_RUNWAY_THRESHOLD_DAYS
}

export interface LowRunwaySummary {
  count: number
  revenueAtRisk: number
}

// Revenue at risk = On Hand × Price across flagged products — same proxy pattern as
// getStalledUnitsSummary's potentialRevenue, ranked for the Attention Feed.
export function getLowRunwaySummary(products: (RunwayFields & Pick<ProductSummary, 'price'>)[]): LowRunwaySummary {
  const list = products.filter(isLowRunway)
  const revenueAtRisk = list.reduce((s, p) => s + (p.price ?? 0) * (p.inventoryQuantity ?? 0), 0)
  return { count: list.length, revenueAtRisk }
}

export interface ReturnRiskSummary {
  count: number
  returnedRevenue: number
}

// Revenue lost to qualifying returns (sizing/style/description/quality) across flagged
// products — Σ(price × returnedUnits), same proxy pattern as getLowRunwaySummary's
// revenueAtRisk, ranked for the Attention Feed.
export function getReturnRiskSummary(products: ProductSummary[]): ReturnRiskSummary {
  const list = products.filter((p) => p.returnFlagged)
  const returnedRevenue = list.reduce((s, p) => s + (p.price ?? 0) * (p.returnedUnits ?? 0), 0)
  return { count: list.length, returnedRevenue }
}

export interface BestSeller {
  title: string
  imageUrl: string | null
  unitsSoldWeek: number
  productId: number | null
}

// Same filter/sort predicate as ProductsInventory's bestSellerIds memo, so the two views
// can never disagree on which product is #1.
export function getBestSeller(products: ProductSummary[]): BestSeller | null {
  const top = [...products]
    .filter((p) => p.unitsSoldWeek > 0)
    .sort((a, b) => b.unitsSoldWeek - a.unitsSoldWeek)[0]
  return top
    ? { title: top.title, imageUrl: top.imageUrl, unitsSoldWeek: top.unitsSoldWeek, productId: top.productId }
    : null
}
