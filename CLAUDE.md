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
- Omnisend (email marketing), Microsoft Graph (Outlook CS inbox)
- No database — JSON files in `data/` for local persistence

## Auth

Two modes (checked in this order by middleware and `getSession()`):
1. **Env var shortcut**: set `SHOPIFY_ACCESS_TOKEN` + `SHOPIFY_STORE_DOMAIN` → skips OAuth entirely
2. **OAuth**: Shopify Partner app flow via `/api/auth` → `/api/auth/callback`; session stored in AES-256-GCM HTTP-only cookie `lela_session`

Required Shopify scopes: `read_orders, read_all_orders, read_customers, write_customers`  
`read_all_orders` is mandatory — without it, orders older than 60 days are invisible.  
`read_products` is **not** granted — always wrap `/products.json` fetches in a try/catch.

## Architecture

### Section pattern
Each dashboard section = one client component in `src/components/sections/` + one or more API routes under `src/app/api/`. The main page (`src/app/page.tsx`) renders sections based on sidebar selection. Add nav entries in `src/components/layout/Sidebar.tsx`.

### API routes
All routes: import `getSession` from `@/lib/session`, `createShopifyClient` from `@/lib/shopify`. Return `NextResponse.json(...)`. Use `shopify.getAll()` for paginated Shopify endpoints.

### Data storage (JSON files — no DB)
| File | Owned by | Contents |
|---|---|---|
| `data/customer-manual-tags.json` | `src/lib/customer-tags-storage.ts` | `{ customerId: string[] }` |
| `data/customer-tag-types.json` | `src/lib/customer-tags-storage.ts` | `string[]` of custom tag names |
| `data/product-categories.json` | `src/lib/product-categories-storage.ts` | `{ "Product Title": "Category" }` |
| `data/tickets.json` | `src/lib/cs-storage.ts` | CS ticket array |
| `data/macros.json` | `src/lib/cs-storage.ts` | CS macro array |
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
- `CUSTOMER_TAGS` — `['VIP', '1-order', 'never-purchased', 'winback']`
- `CSTicket`, `CSMacro`, `CSMessage` — customer service entities
- `ShopifyOrder` includes `line_items: ShopifyLineItem[]`; `product_type` on line items is often empty — use `data/product-categories.json` as fallback

## Reusable UI

`src/components/ui/`: `TagBadge`, `StatCard`, `LoadingSpinner`

## Skills

- `/add-section` — step-by-step for adding a new dashboard section
- `/shopify-debug` — checklist when Shopify API returns wrong/empty data
