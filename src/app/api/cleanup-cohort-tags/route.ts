import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'
import { getEnrichedCustomers } from '@/lib/customers'
import { omnisendGet, omnisendPatch } from '@/lib/omnisend'
import type { OmnisendContact } from '@/types'

const COHORT_TAG_PREFIX = 'lela-cohort-'

function stripCohortTags(rawTags: string[]): { kept: string[]; removedCount: number } {
  const kept = rawTags.filter((t) => !t.startsWith(COHORT_TAG_PREFIX))
  return { kept, removedCount: rawTags.length - kept.length }
}

// One-time cleanup: removes lela-cohort-* tags left on real Shopify customers and
// Omnisend contacts by syncs that ran before CustomerIntelligence.tsx stopped
// pushing the RFM cohort as an external tag (see syncableTags() there). Safe to
// run more than once — customers with no cohort tag left are simply skipped, no
// API call made for them.
export async function POST() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    const customers = await getEnrichedCustomers(shopify, false)

    let shopifyCleaned = 0
    let omnisendCleaned = 0
    const errors: { customerId: number; email: string; error: string }[] = []

    for (const c of customers) {
      try {
        const shopifyRaw = c.tags.split(',').map((t) => t.trim()).filter(Boolean)
        const { kept: shopifyKept, removedCount: shopifyRemoved } = stripCohortTags(shopifyRaw)
        if (shopifyRemoved > 0) {
          await shopify.put(`/customers/${c.id}.json`, { customer: { id: c.id, tags: shopifyKept.join(', ') } })
          shopifyCleaned++
        }

        if (c.email) {
          const search = await omnisendGet<{ contacts: OmnisendContact[] }>('/contacts', { email: c.email })
          const contact = search.contacts?.[0]
          if (contact) {
            const { kept: omniKept, removedCount: omniRemoved } = stripCohortTags(contact.tags ?? [])
            if (omniRemoved > 0) {
              await omnisendPatch(`/contacts/${contact.contactID}`, { tags: omniKept })
              omnisendCleaned++
            }
          }
        }
      } catch (err) {
        errors.push({ customerId: c.id, email: c.email, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    return NextResponse.json({ checked: customers.length, shopifyCleaned, omnisendCleaned, errors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
