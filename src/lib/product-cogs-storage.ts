import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'product-cogs.json')

export interface ProductCogsEntry {
  sku: string
  manualCogs: number
}

// { "8123456789": { "sku": "COLLAR-01", "manualCogs": 4.5 }, ... } — keyed by Shopify product id
export function readProductCogs(): Record<string, ProductCogsEntry> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductCogs(data: Record<string, ProductCogsEntry>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
