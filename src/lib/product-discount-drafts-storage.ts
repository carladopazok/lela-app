import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'product-discount-drafts.json')

// { "8123456789": 20, ... } — keyed by Shopify product id, value is a whole-number discount %
// (0-95) staged in the Products & Inventory spreadsheet tab. Only written when the user clicks
// "Save" there — never autosaved on keystroke.
export function readProductDiscountDrafts(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductDiscountDrafts(data: Record<string, number>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
