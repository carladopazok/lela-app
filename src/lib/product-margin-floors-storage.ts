import fs from 'fs'
import path from 'path'
import type { MarginFloors } from '@/lib/margin-floor'

const FILE = path.join(process.cwd(), 'data', 'product-margin-floors.json')

// { "8123456789": 15, ... } — keyed by Shopify product id, value is the minimum acceptable
// margin % for that product. Products not listed use DEFAULT_MARGIN_FLOOR_PCT (10%). Written
// by the Margin Spreadsheet's "Save" button, alongside the discount drafts.
export function readProductMarginFloors(): MarginFloors {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductMarginFloors(data: MarginFloors): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
