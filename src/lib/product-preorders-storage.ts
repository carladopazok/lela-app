import fs from 'fs'
import path from 'path'
import type { PreorderEntry, PreordersStore } from '@/types'

const FILE = path.join(process.cwd(), 'data', 'product-preorders.json')

// { "8123456789": { "text": "...", "status": "draft", "updatedAt": "..." }, ... } — keyed by Shopify product id
export function readPreorders(): PreordersStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writePreorders(data: PreordersStore): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

export type { PreorderEntry, PreordersStore }
