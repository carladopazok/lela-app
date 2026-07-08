import type { CustomerTag } from '@/types'

interface TaggingInput {
  totalSpent: number
  ordersCount: number
  lastOrderDate: Date | null
  abandonedCheckoutsCount: number
}

const WINBACK_DAYS = 365

export function computeTags(input: TaggingInput): CustomerTag[] {
  const tags: CustomerTag[] = []

  if (input.ordersCount === 0) {
    tags.push('never-purchased')
  } else if (input.ordersCount === 1) {
    tags.push('1-order')
    if (input.lastOrderDate) {
      const daysSince = (Date.now() - input.lastOrderDate.getTime()) / 86_400_000
      if (daysSince <= WINBACK_DAYS) tags.push('winback')
    }
  } else {
    tags.push('VIP')
  }

  if (input.abandonedCheckoutsCount > 0) tags.push('abandoned-checkout')

  return tags
}

export function tagsToShopifyNote(tags: CustomerTag[]): string {
  if (tags.length === 0) return ''
  return `[lela] ${tags.join(', ')}`
}

export function tagsToShopifyTagString(existingTags: string, newTags: CustomerTag[]): string {
  const existing = existingTags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('lela-'))

  const lelaFormatted = newTags.map((t) => `lela-${t}`)
  return [...existing, ...lelaFormatted].join(', ')
}
