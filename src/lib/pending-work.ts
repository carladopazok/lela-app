export type PendingWorkStatus = 'todo' | 'blocked' | 'needs-verification'

export interface PendingWorkItem {
  id: string
  title: string
  area: string
  status: PendingWorkStatus
  summary: string
  instructions: string[]
  relatedFiles?: string[]
  blockedBy?: string
}

// Curated by hand from real gaps found in the codebase (TODO comments, "unverified
// against this account" flags, unrequested Shopify scopes, and features whose
// backend exists but was never wired up externally) — not aspirational, not
// invented. Update this list as items get resolved or new gaps are found.
export const PENDING_WORK: PendingWorkItem[] = [
  {
    id: 'deploy-app',
    title: 'Deploy the dashboard to a public URL',
    area: 'Deployment & Storefront',
    status: 'todo',
    summary: 'Lela only runs locally today (npm run dev). Two other items on this list — the storefront "Notify me" widget and real-time stage-transition tracking — both need the app reachable at a public URL to work at all.',
    instructions: [
      'Pick a host — Vercel is the natural fit for a Next.js App Router app (zero-config deploys, and built-in Cron support for the paused stage-transition work below).',
      'Set the same environment variables from .env.local in the host’s dashboard: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID/SECRET, APP_URL (set to the new public URL), APP_SECRET, OMNISEND_API_KEY, MS_CLIENT_ID/SECRET/TENANT_ID, OUTLOOK_EMAIL, STOREFRONT_ORIGIN.',
      'Update the Shopify Partner Dashboard’s redirect URL to https://<deployed-url>/api/auth/callback.',
      'Come back to the two blocked items below once this is live.',
    ],
  },
  {
    id: 'back-in-stock-widget',
    title: 'Add the "Notify me when available" widget to the live storefront',
    area: 'Deployment & Storefront',
    status: 'blocked',
    blockedBy: 'deploy-app',
    summary: 'The widget code and backend already exist (theme-snippets/back-in-stock.liquid, /api/public/back-in-stock, data/back-in-stock-signups.json) — it just hasn’t been added to the live theme yet, so no real signups are being collected.',
    instructions: [
      'Shopify admin → Online Store → Themes → Edit code → Snippets → new snippet named "back-in-stock" → paste the contents of theme-snippets/back-in-stock.liquid.',
      'Render it from the product template (e.g. main-product.liquid), right after the Add to Cart / variant picker block: {% render \'back-in-stock\', product: product, variant: current_variant %}',
      'In the snippet, replace DASHBOARD_URL with the deployed dashboard’s public URL.',
      'Set STOREFRONT_ORIGIN in the dashboard’s env vars to the storefront’s exact public domain (e.g. https://carladopazo.com) — required for the CORS check in /api/public/back-in-stock/route.ts to let the request through.',
    ],
    relatedFiles: ['theme-snippets/back-in-stock.liquid', 'src/app/api/public/back-in-stock/route.ts', 'src/lib/back-in-stock-storage.ts'],
  },
  {
    id: 'stage-transitions',
    title: 'Real-time stage-transition tracking (webhooks + nightly job)',
    area: 'Deployment & Storefront',
    status: 'blocked',
    blockedBy: 'deploy-app',
    summary: 'Automatically re-tagging a customer and triggering the matching flow the moment their lifecycle stage changes was scoped, then paused — it needs a public URL to receive Shopify webhooks and somewhere to run a scheduled job, neither of which exist yet.',
    instructions: [
      'Deploy the app first (see above).',
      'Confirm inside Omnisend whether automations trigger off segment-membership changes automatically, or need a direct Events API call per transition — this decides the integration pattern.',
      'Resolve "Map Journey board flows to real Omnisend automations" below first — there’s currently no link between a Lela stage and a real Omnisend automation ID to trigger.',
      'Register Shopify webhooks (orders/create, refunds/create, checkouts/create — the last one needs a delayed check, since "abandoned" only becomes true after a few hours of inactivity), build a webhook receiver with HMAC signature verification, a data/stage-transitions.json audit log, and a scheduled job for threshold-only transitions that no webhook covers (e.g. New → Winback purely from elapsed time).',
    ],
  },
  {
    id: 'build-omnisend-automations',
    title: 'Build the actual automations in Omnisend',
    area: 'Omnisend Integration',
    status: 'todo',
    summary: 'Confirmed via Omnisend’s own "Marketing activity performance" report that Automation revenue is tracked separately from Campaign revenue — but it currently shows €0.00 because no automations exist in the account yet. Every flow on the Journey board (Welcome series, Winback day 60, etc.) is a curated, aspirational checklist, not a live Omnisend automation. This blocks the two items below — there’s nothing real to attribute revenue to or map an ID from until automations actually exist.',
    instructions: [
      'In Omnisend, build the automations you actually want live. JOURNEY_AUTOMATIONS in src/lib/journey.ts is a reasonable build order — it’s already organized by lifecycle stage, and each card marked active: true is one you likely want built first.',
      'As each one goes live in Omnisend, update its active: true/false in journey.ts to match reality, and note its real Omnisend automation ID for the mapping item below.',
    ],
    relatedFiles: ['src/lib/journey.ts'],
  },
  {
    id: 'flow-revenue-attribution',
    title: 'Wire real per-flow revenue attribution on the Journey board',
    area: 'Omnisend Integration',
    status: 'blocked',
    blockedBy: 'build-omnisend-automations',
    summary: 'Every "Active" flow card on the Journey tab shows a revenue-per-recipient figure — right now these are hand-picked placeholder numbers (see the comment above JOURNEY_AUTOMATIONS), not real data.',
    instructions: [
      'Check whether Omnisend’s API exposes the same per-automation revenue split shown in the "Marketing activity performance" report (a Statistics/Reports API, or an automation-detail endpoint) — untested; src/lib/omnisend.ts currently only covers /campaigns, /segments, /contacts.',
      'If it exists: add a fetch function to src/lib/omnisend.ts (matching the existing omnisendGet/omnisendDatedGet pattern), a new API route, and replace the static performance values in src/lib/journey.ts with a real fetch in CustomerJourney.tsx.',
      'If not: src/lib/forecast/build-campaign-flow-revenue.ts already has a best-effort, unverified attempt at campaign/flow revenue for the Forecast tab — check whether that can be reused instead of a second integration.',
      'Depends on "Map Journey board flows to real Omnisend automations" below to know which automation each card’s number should come from — and on real automations existing at all (see above), since the numbers will just be €0.00 otherwise.',
    ],
    relatedFiles: ['src/lib/journey.ts', 'src/components/sections/CustomerJourney.tsx', 'src/lib/omnisend.ts', 'src/lib/forecast/build-campaign-flow-revenue.ts'],
  },
  {
    id: 'map-omnisend-automations',
    title: 'Map Journey board flows to real Omnisend automations',
    area: 'Omnisend Integration',
    status: 'blocked',
    blockedBy: 'build-omnisend-automations',
    summary: 'Every card on the Journey tab is a static, hand-written entry — none of the ids correspond to a real Omnisend automation, which is why "View" links to Omnisend’s general dashboard instead of the specific flow.',
    instructions: [
      'In Omnisend, note the real automation ID for each flow built there.',
      'Add an optional omnisendAutomationId field to the JourneyAutomation type in src/lib/journey.ts and populate it per card where a real automation exists.',
      'Once mapped, "View" can deep-link to the specific automation instead of the generic dashboard — and this mapping is a prerequisite for real revenue attribution and event-driven triggering above.',
    ],
    relatedFiles: ['src/lib/journey.ts', 'src/components/sections/CustomerJourney.tsx'],
  },
  {
    id: 'verify-omnisend-links',
    title: 'Verify the Omnisend Automations/Campaign dashboard links',
    area: 'Omnisend Integration',
    status: 'needs-verification',
    summary: 'The Journey board’s "View" and "Create" buttons link to OMNISEND_AUTOMATIONS_URL and OMNISEND_CAMPAIGNS_URL — both are best-effort guesses at Omnisend’s app routes, never confirmed against a live login.',
    instructions: [
      'Log into Omnisend, open the Automations list and the "new campaign" screen, and copy the actual URLs.',
      'Update OMNISEND_AUTOMATIONS_URL / OMNISEND_CAMPAIGNS_URL in src/lib/journey.ts if they differ.',
    ],
    relatedFiles: ['src/lib/journey.ts'],
  },
  {
    id: 'verify-omnisend-contact-creation',
    title: 'Verify the Omnisend contact-creation payload',
    area: 'Omnisend Integration',
    status: 'needs-verification',
    summary: 'omnisendFindOrCreateContact (used when a back-in-stock signup comes from someone who isn’t an Omnisend contact yet) posts a contact-creation body that’s never been confirmed against this account’s real API response.',
    instructions: [
      'Once the back-in-stock widget is live, test a signup end-to-end from an email address with no existing Omnisend contact.',
      'Confirm a real contactID comes back; adjust the POST body in omnisendFindOrCreateContact (src/lib/omnisend.ts) if the response is malformed or contactID is missing.',
    ],
    relatedFiles: ['src/lib/omnisend.ts'],
    blockedBy: 'back-in-stock-widget',
  },
]

export const PENDING_WORK_AREAS = [...new Set(PENDING_WORK.map((item) => item.area))]

export const STATUS_META: Record<PendingWorkStatus, { label: string; bg: string; text: string; border: string }> = {
  todo:                 { label: 'To Do',              bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  blocked:              { label: 'Blocked',            bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
  'needs-verification': { label: 'Needs Verification', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
}
