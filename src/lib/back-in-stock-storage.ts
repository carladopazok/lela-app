import fs from 'fs'
import path from 'path'
import type { BackInStockSignup, BackInStockStore } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'back-in-stock-signups.json')

// { "<productId>": [{ email, variantId, variantTitle, createdAt }, ...] }
export function readBackInStockStore(): BackInStockStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function readBackInStockSignups(productId: string): BackInStockSignup[] {
  return readBackInStockStore()[productId] ?? []
}

// Dedupes on (email, variantId) within the product's list — resubmitting the same
// variant+email doesn't create a duplicate row, but refreshes createdAt.
export function addBackInStockSignup(
  productId: string,
  signup: { email: string; variantId: number; variantTitle: string | null },
): void {
  const store = readBackInStockStore()
  const list = store[productId] ?? []
  const email = signup.email.trim().toLowerCase()

  const filtered = list.filter((s) => !(s.email === email && s.variantId === signup.variantId))
  filtered.push({ email, variantId: signup.variantId, variantTitle: signup.variantTitle, createdAt: new Date().toISOString() })

  store[productId] = filtered
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2))
}
