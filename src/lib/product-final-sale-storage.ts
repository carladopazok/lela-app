import fs from 'fs'
import path from 'path'
import type { FinalSaleEntry, FinalSaleStore } from '@/types'

const FILE = path.join(process.cwd(), 'data', 'product-final-sale.json')

// { "8123456789": { "text": "...", "status": "draft", "updatedAt": "..." }, ... } — keyed by Shopify product id
export function readFinalSale(): FinalSaleStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeFinalSale(data: FinalSaleStore): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

export type { FinalSaleEntry, FinalSaleStore }
