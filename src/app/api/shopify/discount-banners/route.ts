import { NextResponse } from 'next/server'
import { readDiscountBanners } from '@/lib/product-discount-banners-storage'

export async function GET() {
  return NextResponse.json({ banners: readDiscountBanners() })
}
