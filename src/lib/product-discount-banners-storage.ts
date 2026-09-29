import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'product-discount-banners.json')

// Local mirror of every product's live custom.discount_banner metafield, so the dashboard can
// show which products have a banner without querying Shopify per product.
export interface DiscountBannerEntry {
  discountId: string
  title: string
  code: string | null // null = automatic discount (no code needed)
  message: string
  endsAt: string | null
  publishedAt: string
}

export function readDiscountBanners(): Record<string, DiscountBannerEntry> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeDiscountBanners(data: Record<string, DiscountBannerEntry>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}
