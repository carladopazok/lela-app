import type { LifecycleStage } from './segmentation'
import type { RFMSegment } from './rfm'

export type SourceValue = 'website-form' | 'event' | 'giveaway' | 'referral'
export const SOURCE_VALUES: SourceValue[] = ['website-form', 'event', 'giveaway', 'referral']

// Kebab-case tag values, distinct from (and additive to) the un-namespaced
// STAGE_TO_TAG values in tagging.ts — these exist purely so Omnisend automations
// can branch on stage:*/rfm:* without colliding with each other's vocabulary
// (e.g. 'at-risk' means something different under stage: vs rfm:).
export const STAGE_TAG_VALUES: Record<LifecycleStage, string> = {
  'Never Purchased': 'lead',
  New: 'new',
  Active: 'active',
  Winback: 'winback',
  Loyal: 'loyal',
  VIP: 'vip',
  'At Risk': 'at-risk',
  Lapsed: 'lapsed',
  Lost: 'lost',
}

export const RFM_TAG_VALUES: Record<RFMSegment, string> = {
  Champions: 'champion',
  Loyal: 'loyal',
  'Potential Loyalists': 'potential-loyalist',
  'Needs Attention': 'needs-attention',
  'At Risk': 'at-risk',
  Lost: 'lost',
  'Never Purchased': 'never-purchased', // unused — computeRfmTier() never returns this segment
}

type NamespacedFamily = 'stage' | 'rfm' | 'rfm-at-lapse' | 'source'

// Strips any existing tag under a touched family's `family:` prefix and adds the
// new value, leaving every other tag (including all lela-* tags) untouched. A
// `null` value clears that family's tag without adding a replacement — used when
// rfm-at-lapse: is cleared on re-engagement. Operates on plain string arrays so
// the same function serves both Shopify (comma-split) and Omnisend (native array) tags.
export function swapNamespacedTagsInList(
  existingRaw: string[],
  updates: Partial<Record<NamespacedFamily, string | null>>
): string[] {
  const touchedPrefixes = Object.keys(updates).map((family) => `${family}:`)
  const kept = existingRaw.filter((tag) => !touchedPrefixes.some((prefix) => tag.startsWith(prefix)))
  const additions = Object.entries(updates)
    .filter((entry): entry is [NamespacedFamily, string] => entry[1] != null)
    .map(([family, value]) => `${family}:${value}`)
  return [...kept, ...additions]
}
