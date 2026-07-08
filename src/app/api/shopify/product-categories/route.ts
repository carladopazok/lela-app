import { NextRequest, NextResponse } from 'next/server'
import { readProductCategories, writeProductCategories } from '@/lib/product-categories-storage'

export async function GET() {
  return NextResponse.json({ categories: readProductCategories() })
}

// Assign a category to a product: { title, category }
export async function POST(req: NextRequest) {
  const { title, category } = await req.json()
  if (!title || !category) return NextResponse.json({ error: 'title and category required' }, { status: 400 })
  const data = readProductCategories()
  data[title] = category.trim()
  writeProductCategories(data)
  return NextResponse.json({ categories: data })
}

// Remove a product's category: { title }
export async function DELETE(req: NextRequest) {
  const { title } = await req.json()
  const data = readProductCategories()
  delete data[title]
  writeProductCategories(data)
  return NextResponse.json({ categories: data })
}
