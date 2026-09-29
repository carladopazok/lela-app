import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'inventory-snapshots.json')

// Shopify's API has no inventory-adjustment history, so restocks are detected by the app
// itself: every products load records each product's total on-hand quantity, and a rise of
// at least RESTOCK_MIN_INCREASE units since the last snapshot counts as a restock. Single-unit
// rises are ignored — those are usually a returned item going back into stock, not a restock.
// Tracking only starts when a product is first seen, so older restocks are unknown.
export const RESTOCK_MIN_INCREASE = 2

interface InventorySnapshot {
  qty: number
  lastSeenAt: string
  lastRestockedAt: string | null
  trackingSince: string
}

// { "<productId>": { qty, lastSeenAt, lastRestockedAt, trackingSince } }
type SnapshotStore = Record<string, InventorySnapshot>

function readStore(): SnapshotStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function recordInventorySnapshots(
  entries: { productId: number; qty: number }[],
): Map<number, { lastRestockedAt: string | null; trackingSince: string }> {
  const store = readStore()
  const now = new Date().toISOString()
  const result = new Map<number, { lastRestockedAt: string | null; trackingSince: string }>()
  for (const { productId, qty } of entries) {
    const key = String(productId)
    const prev = store[key]
    const next: InventorySnapshot = prev
      ? {
          qty,
          lastSeenAt: now,
          lastRestockedAt: qty - prev.qty >= RESTOCK_MIN_INCREASE ? now : prev.lastRestockedAt,
          trackingSince: prev.trackingSince,
        }
      : { qty, lastSeenAt: now, lastRestockedAt: null, trackingSince: now }
    store[key] = next
    result.set(productId, { lastRestockedAt: next.lastRestockedAt, trackingSince: next.trackingSince })
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2))
  return result
}
