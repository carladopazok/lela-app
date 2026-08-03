import { createShopifyClient } from './shopify'
import { swapNamespacedTagsInList, type SourceValue } from './tag-sync'
import { omnisendGet, omnisendPatch } from './omnisend'
import { readTagSyncMap, writeTagSyncMap } from './tag-sync-storage'
import type { OmnisendContact } from '@/types'

interface LeadSourceCustomer {
  id: number
  email: string
  tags: string
}

// Called from src/app/api/public/tag-lead-source/route.ts — the one shared entry
// point every capture touchpoint (popup, event signup, giveaway, referral) calls,
// so this tagging logic lives in one place per the spec. Set-once/immutable: a
// customer's source:* is never overwritten once recorded, so the first capture wins.
export async function tagLeadSource(
  shopify: ReturnType<typeof createShopifyClient>,
  customer: LeadSourceCustomer,
  source: SourceValue
): Promise<{ alreadySet: boolean }> {
  const map = readTagSyncMap()
  const key = String(customer.id)
  const prior = map[key]
  if (prior?.source) return { alreadySet: true }

  const existingShopifyRaw = customer.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const mergedShopifyTags = swapNamespacedTagsInList(existingShopifyRaw, { source })
  await shopify.put(`/customers/${customer.id}.json`, {
    customer: { id: customer.id, tags: mergedShopifyTags.join(', ') },
  })

  if (customer.email) {
    const search = await omnisendGet<{ contacts: OmnisendContact[] }>('/contacts', { email: customer.email })
    const contact = search.contacts?.[0]
    if (contact) {
      const mergedOmnisendTags = swapNamespacedTagsInList(contact.tags ?? [], { source })
      await omnisendPatch(`/contacts/${contact.contactID}`, { tags: mergedOmnisendTags })
    }
  }

  const now = new Date().toISOString()
  map[key] = {
    stage: prior?.stage ?? 'Never Purchased',
    rfmTier: prior?.rfmTier ?? null,
    rfmAtLapse: prior?.rfmAtLapse ?? null,
    source,
    updatedAt: prior?.updatedAt ?? now,
    sourceUpdatedAt: now,
  }
  writeTagSyncMap(map)

  return { alreadySet: false }
}
