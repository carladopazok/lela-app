# Lela Dashboard — Claude Context

Personal ecommerce operations dashboard for carladopazo.com (Shopify). Portfolio piece + daily ops tool. See `README.md` for env var reference.

## Run

```bash
npm run dev   # → http://localhost:3000
```

If the site stops responding: `pkill -f "next dev"` then `npm run dev` again.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS 3
- Shopify Admin REST API v2024-10
- Omnisend (email marketing), Microsoft Graph (Outlook CS inbox), Ollama cloud API (CS "Draft with AI")
- No database — JSON files in `data/` for local persistence

## Auth

Two modes (checked in this order by middleware and `getSession()`):
1. **Env var shortcut**: set `SHOPIFY_ACCESS_TOKEN` + `SHOPIFY_STORE_DOMAIN` → skips OAuth entirely
2. **OAuth**: Shopify Partner app flow via `/api/auth` → `/api/auth/callback`; session stored in AES-256-GCM HTTP-only cookie `lela_session`

Required Shopify scopes: `read_orders, read_all_orders, read_customers, write_customers, read_products, write_products, read_inventory, read_returns, write_discounts`  
`read_all_orders` is mandatory — without it, orders older than 60 days are invisible.  
`read_products` and `read_inventory` are granted (confirmed 2026-07-15) — the try/catch wrapping around `/products.json` fetches can stay as general defensive error handling, but isn't compensating for a missing scope anymore.  
`read_returns` was added 2026-07-24 for the Product Health / return-rate flag (`src/lib/shopify-returns.ts`) — confirmed granted 2026-07-24.  
`write_products` was already relied on by the product status toggle (`src/app/api/shopify/products/[id]/status/route.ts`) and is also used to write the `custom.fit_note` metafield (`src/app/api/shopify/products/[id]/fit-note/route.ts`) — confirmed granted 2026-07-28; was missing from this list even though both features depend on it. Also used by the Products & Inventory "Stockout Actions" tag toggles (`lela-low-stock`, `lela-restock-early` — `src/lib/product-tags.ts`, `src/app/api/shopify/products/[id]/tags/route.ts`) and by the `custom.preorder` metafield write (`src/app/api/shopify/products/[id]/preorder/route.ts`, added 2026-07-31 — same draft/publish pattern as Fit Note, entered from the Stockout Actions panel behind the Low Runway flag).  
`write_discounts` was added 2026-07-31 for the Stalled Inventory discount-creation flow (`src/lib/shopify-discounts.ts`, `src/app/api/shopify/products/[id]/create-discount/route.ts`, entered from `StalledCampaignPanel`'s discount selector in Products & Inventory) — not yet confirmed granted; requires an OAuth reconnect (or, for the env-var shortcut auth mode, a manual scope update on the custom app's token in the Shopify admin).

## Architecture

### Section pattern
Each dashboard section = one client component in `src/components/sections/` + one or more API routes under `src/app/api/`. The main page (`src/app/page.tsx`) renders sections based on sidebar selection. Add nav entries in `src/components/layout/Sidebar.tsx`.

### API routes
All routes: import `getSession` from `@/lib/session`, `createShopifyClient` from `@/lib/shopify`. Return `NextResponse.json(...)`. Use `shopify.getAll()` for paginated Shopify endpoints.

### AI Drafting (Customer Service)
"Draft with AI" button on open tickets (`TicketDetail` in `src/components/sections/CustomerService.tsx`) calls `POST /api/cs/tickets/[id]/ai-draft`, which calls `draftTicketReply()` in `src/lib/ollama.ts`. Manual trigger only — never runs automatically, never auto-sends; the result just pre-fills the existing reply textarea and a dismissible suggested-tag badge, both requiring an explicit user action (Send / Apply) same as inserting a macro does today. Uses Ollama's cloud API, model `gemma4:cloud`, native `/api/chat` shape (not OpenAI-compatible) at `https://ollama.com/api/chat`, authenticated via `Authorization: Bearer $OLLAMA_API_KEY`. Requires `OLLAMA_API_KEY` in `.env.local` (see `.env.local.example`). Uses `format: "json"` (plain JSON mode) plus explicit prompt instructions to get a structured `{ tag, draft }` response — the schema-object variant of `format` documented by Ollama is silently ignored by `gemma4:cloud` (verified directly against their own docs example, which returned free-form prose). Even in JSON mode the model occasionally wraps output in a ` ```json ` fence despite being told not to, so `stripCodeFence()` in `ollama.ts` strips that before parsing. Customer context (order count/AOV/tags) is passed from the client's already-loaded `customers` list (no new Shopify fetch); macro matching is left to the model itself (all macros are included in the prompt) rather than a custom similarity algorithm. On failure the real upstream error is surfaced in the UI — no mock/fallback draft.

Standing preferences live in the "Agent" tab of Customer Service (`AgentGuidancePanel` in `CustomerService.tsx`) — agent name, tone of voice, a standard closing message, and a list of titled guidance notes (e.g. "Refunds over €100"), stored as one JSON object via `GET`/`PUT /api/cs/agent-guidance` (`readAgentGuidance()`/`writeAgentGuidance()` in `cs-storage.ts`). Tone of voice and the notes are read server-side into every `ai-draft` call and injected into the prompt as "standing instructions", separate from the one-off per-draft `guidance` (regenerate box), which is layered on top for that draft only. Agent name and the standard message are *not* left to the model — `appendSignature()` in `ollama.ts` appends them deterministically after the model responds (`draft + "\n\n— {agentName}\n\n{standardMessage}"`), since a signature that must appear on every reply can't depend on whether the model remembers to include it; the prompt separately tells the model not to invent its own sign-off, so there's no duplicate. Saving guidance doesn't trigger anything — it only changes what future "Draft with AI" clicks send.

### Data storage (JSON files — no DB)
| File | Owned by | Contents |
|---|---|---|
| `data/customer-manual-tags.json` | `src/lib/customer-tags-storage.ts` | `{ customerId: string[] }` |
| `data/customer-tag-types.json` | `src/lib/customer-tags-storage.ts` | `string[]` of custom tag names |
| `data/product-categories.json` | `src/lib/product-categories-storage.ts` | `{ "Product Title": "Category" }` |
| `data/product-fit-notes.json` | `src/lib/product-fit-notes-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.fit_note` metafield |
| `data/product-preorders.json` | `src/lib/product-preorders-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.preorder` metafield |
| `data/tickets.json` | `src/lib/cs-storage.ts` | CS ticket array |
| `data/macros.json` | `src/lib/cs-storage.ts` | CS macro array |
| `data/agent-guidance.json` | `src/lib/cs-storage.ts` | `{ agentName, toneOfVoice, standardMessage, notes: [{ id, title, body, createdAt, updatedAt? }] }` — standing instructions for "Draft with AI" |
| `data/ms-tokens.json` | `src/lib/ms-graph.ts` | Microsoft OAuth tokens |

## Design System

Custom Tailwind palette — use these tokens, never raw hex:

| Token | Use |
|---|---|
| `terracotta-{100–700}` | Primary actions, active tags, CTAs |
| `olive-{100–800}` | Success states, sync buttons |
| `cream-{50–300}` | Hover backgrounds |
| `sand-{100–400}` | Borders, dividers, subtle backgrounds |
| `charcoal-{400–900}` | Text (400 = muted, 700 = body, 900 = headings) |

Fonts: `font-sans` = DM Sans, `font-serif` = Playfair Display  
Card pattern: `bg-white rounded-2xl shadow-card p-5`  
Section header: `text-xs font-semibold uppercase tracking-widest text-charcoal-400`

## Key Types (`src/types/index.ts`)

- `EnrichedCustomer` — `ShopifyCustomer` + `{ aov, lastOrderDate, computedTags, manualTags, productTags }`
- `ScoredCustomer` — `EnrichedCustomer` + `{ rfm: { r, f, m }, segment }` (from `src/lib/rfm.ts`)
- `CUSTOMER_TAGS` — `['VIP', 'loyal', 'active', '1-order', 'winback', 'at-risk', 'lapsed', 'lost', 'never-purchased', 'abandoned-checkout']`, computed by the shared classifier in `src/lib/segmentation.ts` (see its changelog comment for thresholds)
- `CSTicket`, `CSMacro`, `CSMessage`, `AgentGuidance`, `AgentGuidanceNote` — customer service entities
- `ShopifyOrder` includes `line_items: ShopifyLineItem[]`; `product_type` on line items is often empty — use `data/product-categories.json` as fallback

## Reusable UI

`src/components/ui/`: `TagBadge`, `StatCard`, `LoadingSpinner`

## Skills

- `/add-section` — step-by-step for adding a new dashboard section
- `/shopify-debug` — checklist when Shopify API returns wrong/empty data
