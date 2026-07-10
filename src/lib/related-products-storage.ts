import fs from 'fs'
import path from 'path'
import type { RelatedProductsData } from '@/types'

const FILE = path.join(process.cwd(), 'data', 'related-products.json')

const EMPTY: RelatedProductsData = { computedAt: null, minSharedOrders: 3, relations: {} }

export function readRelatedProducts(): RelatedProductsData {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return EMPTY
  }
}

export function writeRelatedProducts(data: RelatedProductsData): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
