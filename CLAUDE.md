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
- Omnisend (email marketing), Microsoft Graph (Outlook CS inbox), Instagram Graph API (Instagram DM CS inbox), Ollama cloud API (CS "Draft with AI")
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
"Draft with AI" button on open tickets (`TicketDetail` in `src/components/sections/CustomerService.tsx`) calls `POST /api/cs/tickets/[id]/ai-draft`, which calls `draftTicketReply()` in `src/lib/ollama.ts`. Manual trigger only — never runs automatically, never auto-sends; the result just pre-fills the existing reply textarea and a dismissible suggested-tag badge, both requiring an explicit user action (Send / Apply) same as inserting a macro does today. Uses Ollama's cloud API, model `gemma4:cloud`, native `/api/chat` shape (not OpenAI-compatible) at `https://ollama.com/api/chat`, authenticated via `Authorization: Bearer $OLLAMA_API_KEY`. Requires `OLLAMA_API_KEY` in `.env.local` (see `.env.local.example`). Uses `format: "json"` (plain JSON mode) plus explicit prompt instructions to get a structured `{ tag, draft }` response — the schema-object variant of `format` documented by Ollama is silently ignored by `gemma4:cloud` (verified directly against their own docs example, which returned free-form prose). Even in JSON mode the model occasionally wraps output in a ` ```json ` fence despite being told not to, so `stripCodeFence()` in `ollama.ts` strips that before parsing. Customer context (order count/AOV/tags) is passed from the client's already-loaded `customers` list (no new Shopify fetch). On failure the real upstream error is surfaced in the UI — no mock/fallback draft.

**Retrieval step (Pinecone):** Before building the prompt, `draftTicketReply()` calls `retrieveContext()` in `src/lib/pinecone.ts`, which queries a pre-existing Pinecone Assistant (name `lela`, created and populated manually via the Pinecone console — not by this codebase) with the ticket's subject + thread text. This replaced the earlier approach of embedding every macro verbatim into the prompt and letting the model pick — retrieval is now a real semantic-search step, and it also surfaces policy-doc content (previously not used in the prompt at all). Uses the Assistant's **Context API** (`assistant.context({ query, topK })`) specifically because it stops before Pinecone's own generation step — retrieval only, gemma4 is still the only thing that drafts text. `topK` is 4. Two files are uploaded to the assistant: `Macros_Customer_Service_Carla_Dopazo.md` and `SOPs_Carla_Dopazo.md` (Spanish-language macros/SOPs) — if more files are added or removed, no code change is needed since retrieval is dynamic, but expect the assistant's own chunking to occasionally split a macro across snippet boundaries. Retrieved snippets (`content`, `score`, `reference.file.name`) are formatted into a "Retrieved context" section of the prompt in place of the old "Macros" section; `reference.file.name` is surfaced to the model as the snippet's source. Requires `PINECONE_API_KEY` in `.env.local` (see `.env.local.example`); uses `@pinecone-database/pinecone` v8. Confirmed working end-to-end (real retrieval + real gemma4 draft) 2026-08-19.

Standing preferences live in the "Agent" tab of Customer Service (`AgentGuidancePanel` in `CustomerService.tsx`) — agent name, tone of voice, a standard closing message, and a list of titled guidance notes (e.g. "Refunds over €100"), stored as one JSON object via `GET`/`PUT /api/cs/agent-guidance` (`readAgentGuidance()`/`writeAgentGuidance()` in `cs-storage.ts`). Tone of voice and the notes are read server-side into every `ai-draft` call and injected into the prompt as "standing instructions", separate from the one-off per-draft `guidance` (regenerate box), which is layered on top for that draft only. Agent name and the standard message are *not* left to the model — `appendSignature()` in `ollama.ts` appends them deterministically after the model responds (`draft + "\n\n— {agentName}\n\n{standardMessage}"`), since a signature that must appear on every reply can't depend on whether the model remembers to include it; the prompt separately tells the model not to invent its own sign-off, so there's no duplicate. Saving guidance doesn't trigger anything — it only changes what future "Draft with AI" clicks send.

### Instagram DM (Customer Service)
A second "Instagram" tab in `CustomerService.tsx`, alongside the email "Tickets" tab, sharing the same `CSTicket`/`CSMessage` types (discriminated by `channel: 'email' | 'instagram'`) and the same Tags/Macros/Agent tabs. Both tabs render through the shared `TicketsPane` component, parametrized by channel — not a sidebar submenu, since the sidebar has no submenu precedent anywhere in this app.

Uses Meta's **"Instagram API with Instagram Login"** product — confirmed against this app's actual Meta dashboard ("Welcome to Instagram API" onboarding, with its own Instagram App ID/Secret and a "Generate access tokens" test tool). This is a standalone flow with **no Facebook Page or Facebook Login involved at all** — do not confuse it with the older Facebook-Login/Pages-based "Instagram Graph API" that most third-party tutorials (and Meta's own older docs pages) describe; that flow uses different hosts, scopes, and a Page-token indirection this integration doesn't need. Confirmed empirically with a real test token from the dashboard's "Generate access tokens" tool: `GET graph.instagram.com/{ig_user_id}/conversations` works directly with no Page in the picture, auth'd via `Authorization: Bearer` header (not query-param `access_token`).
- Authorize: `www.instagram.com/oauth/authorize` — **not** `facebook.com`
- Scopes: `instagram_business_basic`, `instagram_business_manage_messages` — the old `instagram_basic`/`instagram_manage_messages`/`pages_*` names were deprecated Jan 2025
- Code → short-lived token: `POST api.instagram.com/oauth/access_token` (form-encoded), returns `{access_token, user_id}` — `user_id` is used directly as `ig_user_id`, no Page/Business Account lookup needed
- Long-lived exchange: `GET graph.instagram.com/access_token` (`grant_type=ig_exchange_token`)
- Refresh: `GET graph.instagram.com/refresh_access_token` (`grant_type=ig_refresh_token`) — a dedicated refresh endpoint, unlike the exchange-only pattern the first version of this integration guessed at
- The app's redirect URI is registered on the **Instagram API product's own setup page** in the Meta dashboard (not Facebook Login → Valid OAuth Redirect URIs, which doesn't apply to this product)

Manual "Sync DMs" button only (`POST /api/cs/instagram/sync`) — no webhooks, no cron, same philosophy as the existing Outlook "Sync inbox" button, so no public HTTPS endpoint is required for local dev. (Meta's own docs page for this product's messaging API only documents Send + webhooks, not a polling endpoint — but polling `/{ig_user_id}/conversations` was verified working directly against a real token, so it's used anyway.)

Unlike Outlook (one new message = one new ticket), Instagram DMs are conversations, so sync is one-ticket-per-conversation: `messageId` on an Instagram `CSTicket` holds the IG **conversation id**, not a message id, and repeat syncs merge new messages into the existing `thread`. To dedup correctly (including not re-adding our own replies as spurious inbound messages), `CSMessage.id` for Instagram messages is the real IG message id in both directions, not `randomUUID()` — see `src/app/api/cs/instagram/sync/route.ts`. Note: the `participants`/`from`/`to` field shapes used to identify the customer vs. the connected account are per Graph API convention but have not yet been verified against a real conversation with actual messages (the test account had zero DMs) — worth double-checking the first time a real DM comes through.

Token lifecycle in `src/lib/instagram-graph.ts` (`data/instagram-tokens.json`, `{access_token, ig_user_id, expires_at}`) refreshes proactively when within ~7 days of the stored `expires_at`, via the dedicated `ig_refresh_token` grant above (not a generic OAuth `refresh_token` grant like `ms-graph.ts` uses).

Replies are subject to Meta's 24-hour messaging window — attempting to reply outside it is caught in `sendMessage()` and surfaced as an explicit error in the reply route/UI (no silent failure, matching the "no mock/fallback" convention used elsewhere in this app).

Known limitation: Instagram gives no email address, so the customer-context lookup in `draftWithAI()` (matches by email) always misses for Instagram tickets — the AI draft still works, just without order-history context. "View customer profile" is disabled for the same reason.

**Current status: code-complete but not yet connected.** `/api/instagram/status` (shown on the Integrations tab, `src/components/sections/Integrations.tsx`) reports `hasIGAuth()` — false until the one-time OAuth "Connect" step completes. That step is blocked locally: Meta's Instagram Login requires an HTTPS redirect URI, and local dev only serves plain HTTP. The OAuth flow, scopes, and messaging calls have all been verified working against the real Meta app (including a live test of `graph.instagram.com` conversations with a real token) — what's missing is just an HTTPS-capable environment (a deployment, or a stable local tunnel) to click through the connect step once.

### Margin Spreadsheet (Products & Inventory)
A second "Spreadsheet" tab in `ProductsInventory.tsx`, alongside the existing "Overview" tab (KPI cards + main table) — same in-page-tab pattern as Customer Service's Tickets/Instagram/Tags/Macros/Agent tabs, since this app has no sidebar-submenu precedent. Both tabs are plain local `useState` in `ProductsInventory`; no `Sidebar.tsx`/`page.tsx` changes.

Lists every product with a Shopify id (cost, price, margin) plus a per-row discount % input that recalculates price/margin at that discount live, client-side, with no network call. The discount % is scratch "what-if" state — it is **not** autosaved; a single "Save" button persists the entire current set of row discount %s in one write to `data/product-discount-drafts.json` via `GET`/`PUT /api/shopify/product-discount-drafts` (`readProductDiscountDrafts()`/`writeProductDiscountDrafts()` in `product-discount-drafts-storage.ts`). Reloading before Save discards unsaved edits.

A "Marked Down" column shows whether the product is currently on sale — true when the first variant's `compareAtPrice` (Shopify's `compare_at_price`, added to `ProductSummary`/`ShopifyProductVariant` for this) is set and higher than its current `price` (`isMarkedDown()` in `ProductsInventory.tsx`). Shows the pre-markdown ("was") price alongside the badge; both this column and every other column are sortable via the shared `SortableTh` (generalized to a generic `<K extends string>` key so both tabs' distinct sort-key unions can reuse it).

Each row has three independent Shopify write actions, all behind an inline confirm (no modal):
- **Markdown** — directly overwrites the product's live price via `markdownProductVariants()` (`src/lib/shopify-discounts.ts`), called through the dedicated `POST /api/shopify/products/[id]/markdown` route. Writes via `PUT /products/{id}.json`, i.e. the already-confirmed `write_products` scope — not `write_discounts` — so this action doesn't depend on the pending discount-scope reconnect below. On success the row's discount resets to 0 (it's now baked into the real price) and the full product list is refetched.
- **Revert Markdown** — the inverse: `revertMarkdown()` (same file), via `POST /api/shopify/products/[id]/revert-markdown`, restores price from `compare_at_price` and clears it. Only shown when the row is currently marked down. Also just `write_products`.
- **Create Discount** — creates a real Shopify discount code via the existing `create-discount` route (called with `markdown: false`), reusing `createProductDiscountCode()` unchanged. Needs `write_discounts`, which per the Auth section above is not yet confirmed granted — may 403 until an OAuth reconnect; the raw error is surfaced rather than masked.

### Data storage (JSON files — no DB)
| File | Owned by | Contents |
|---|---|---|
| `data/customer-manual-tags.json` | `src/lib/customer-tags-storage.ts` | `{ customerId: string[] }` |
| `data/customer-tag-types.json` | `src/lib/customer-tags-storage.ts` | `string[]` of custom tag names |
| `data/product-categories.json` | `src/lib/product-categories-storage.ts` | `{ "Product Title": "Category" }` |
| `data/product-fit-notes.json` | `src/lib/product-fit-notes-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.fit_note` metafield |
| `data/product-preorders.json` | `src/lib/product-preorders-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.preorder` metafield |
| `data/product-discount-drafts.json` | `src/lib/product-discount-drafts-storage.ts` | `{ productId: discountPercent }` — scratch discount % per product staged in the Products & Inventory "Spreadsheet" tab, only written when its "Save" button is clicked |
| `data/tickets.json` | `src/lib/cs-storage.ts` | CS ticket array |
| `data/macros.json` | `src/lib/cs-storage.ts` | CS macro array |
| `data/agent-guidance.json` | `src/lib/cs-storage.ts` | `{ agentName, toneOfVoice, standardMessage, notes: [{ id, title, body, createdAt, updatedAt? }] }` — standing instructions for "Draft with AI" |
| `data/ms-tokens.json` | `src/lib/ms-graph.ts` | Microsoft OAuth tokens |
| `data/instagram-tokens.json` | `src/lib/instagram-graph.ts` | `{ access_token, page_id, ig_user_id, expires_at }` — Meta OAuth tokens |

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
- `CSTicket`, `CSMacro`, `CSMessage`, `AgentGuidance`, `AgentGuidanceNote` — customer service entities; `CSTicket.channel: 'email' | 'instagram'` discriminates Outlook vs Instagram DM tickets
- `ShopifyOrder` includes `line_items: ShopifyLineItem[]`; `product_type` on line items is often empty — use `data/product-categories.json` as fallback

## Reusable UI

`src/components/ui/`: `TagBadge`, `StatCard`, `LoadingSpinner`

## Skills

- `/add-section` — step-by-step for adding a new dashboard section
- `/shopify-debug` — checklist when Shopify API returns wrong/empty data
