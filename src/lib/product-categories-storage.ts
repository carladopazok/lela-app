import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'product-categories.json')

// { "Collar Dransa": "Accessories", "Dog Bed Large": "Beds", ... }
export function readProductCategories(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductCategories(data: Record<string, string>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
