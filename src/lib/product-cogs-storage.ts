import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'product-cogs.json')

// { "Collar Dransa": 4.5, "Dog Bed Large": 12, ... } — manually entered cost per unit
export function readProductCogs(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeProductCogs(data: Record<string, number>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
