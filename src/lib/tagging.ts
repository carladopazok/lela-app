import type { CustomerTag } from '@/types'
import {
  classifyCustomerStage,
  hasRecentAbandonedCheckout,
  type LifecycleStage,
  type AbandonedCheckoutLike,
} from './segmentation'

interface TaggingInput {
  ordersCount: number
  lastOrderDate: Date | null
  emailMarketingConsentState?: string | null
  abandonedCheckouts: AbandonedCheckoutLike[]
}

// Tag strings kept identical to the ones already synced onto live Shopify/Omnisend
// contacts under the old rules (never-purchased, VIP, winback, 1-order,
// abandoned-checkout), so existing synced tags aren't orphaned. 'loyal', 'at-risk',
// and 'lapsed'/'lost' are new — see src/lib/segmentation.ts for the thresholds.
const STAGE_TO_TAG: Record<LifecycleStage, CustomerTag> = {
  'Never Purchased': 'never-purchased',
  New: '1-order',
  Winback: 'winback',
  Loyal: 'loyal',
  VIP: 'VIP',
  'At Risk': 'at-risk',
  Lapsed: 'lapsed',
  Lost: 'lost',
}

// Thin wrapper around the shared classifier (src/lib/segmentation.ts) — this file
// used to compute its own independent, order-count-only rules; see that module's
// changelog comment for exactly what changed and why.
export function computeTags(input: TaggingInput): CustomerTag[] {
  const stage = classifyCustomerStage({
    ordersCount: input.ordersCount,
    lastOrderDate: input.lastOrderDate,
    emailMarketingConsentState: input.emailMarketingConsentState,
  })
  const tags: CustomerTag[] = [STAGE_TO_TAG[stage]]
  if (hasRecentAbandonedCheckout(input.abandonedCheckouts)) tags.push('abandoned-checkout')
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
