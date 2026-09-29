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

Required Shopify scopes: `read_orders, read_all_orders, read_customers, write_customers, read_products, write_products, read_inventory, read_returns, read_discounts, write_discounts`  
`read_all_orders` is mandatory — without it, orders older than 60 days are invisible.  
`read_products` and `read_inventory` are granted (confirmed 2026-07-15) — the try/catch wrapping around `/products.json` fetches can stay as general defensive error handling, but isn't compensating for a missing scope anymore.  
`read_returns` was added 2026-07-24 for the Product Health / return-rate flag (`src/lib/shopify-returns.ts`) — confirmed granted 2026-07-24.  
`write_products` was already relied on by the product status toggle (`src/app/api/shopify/products/[id]/status/route.ts`) and is also used to write the `custom.fit_note` metafield (`src/app/api/shopify/products/[id]/fit-note/route.ts`) — confirmed granted 2026-07-28; was missing from this list even though both features depend on it. Also used by the Products & Inventory "Stockout Actions" tag toggles (`lela-low-stock`, `lela-restock-early` — `src/lib/product-tags.ts`, `src/app/api/shopify/products/[id]/tags/route.ts`) and by the `custom.preorder` metafield write (`src/app/api/shopify/products/[id]/preorder/route.ts`, added 2026-07-31 — same draft/publish pattern as Fit Note, entered from the Stockout Actions panel behind the Low Runway flag). Also used by the `custom.final_sale` metafield write (`src/app/api/shopify/products/[id]/final-sale/route.ts`, added 2026-09-28 — same draft/publish pattern) and, on the same publish/unpublish call, to toggle the `lela-final-sale` tag (added to `TOGGLEABLE_PRODUCT_TAGS` in `product-tags.ts` — the tag is driven server-side by the note's publish state, not a separate manual toggle button like the Stockout Actions tags).  
`read_discounts` was added 2026-09-29 for the Discounts tab and discount banners (`src/lib/shopify-discount-list.ts`: `discountNodes` / `discountNode` queries). It's not yet confirmed granted and needs an OAuth reconnect, the same as `write_discounts` below.  
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

Each row has four independent Shopify write actions, all behind an inline confirm (no modal):
- **Markdown** — directly overwrites the product's live price via `markdownProductVariants()` (`src/lib/shopify-discounts.ts`), called through the dedicated `POST /api/shopify/products/[id]/markdown` route. Writes via `PUT /products/{id}.json`, i.e. the already-confirmed `write_products` scope — not `write_discounts` — so this action doesn't depend on the pending discount-scope reconnect below. On success the row's discount resets to 0 (it's now baked into the real price) and the full product list is refetched.
- **Revert Markdown** — the inverse: `revertMarkdown()` (same file), via `POST /api/shopify/products/[id]/revert-markdown`, restores price from `compare_at_price` and clears it. Only shown when the row is currently marked down. Also just `write_products`.
- **Update Total Cost on Shopify** — only shown when the product has a saved Cost Breakdown. It writes that total into Shopify's "Cost per item" on every variant via `updateProductCostPerItem()` (`src/lib/shopify-cost.ts`), which uses GraphQL `productVariantsBulkUpdate` with `inventoryItem.cost`, through `POST /api/shopify/products/[id]/cost`.
  - The route recomputes the total from the **saved** `product-cost-breakdown.json` rather than trusting the request, so unsaved edits can't reach Shopify.
  - On success the local product's `nativeCogs` is patched to match. The button then turns into "Cost synced with Shopify" while the two match (within half a cent).
  - Assumed to need only the already-granted `write_products` scope. **Not yet verified against the live store:** the OAuth session is only in the browser cookie, so it couldn't be tested from the terminal. If Shopify rejects it for access, add `write_inventory` to `SCOPES` in `src/app/api/auth/route.ts` and reconnect. Shopify's real error is shown in the row.
- **Bulk version:** "Sync N costs to Shopify" in the Spreadsheet toolbar. It targets every product whose saved breakdown total differs from Shopify's cost, ignoring the search and collection filters, after one inline confirm. It runs the same per-product push one product at a time, showing progress and each row's result. It stops after 3 failures in a row, since that usually means a systemic problem such as a missing scope or expired session. It shows "Costs synced" and is disabled when nothing differs.
- **Create Discount** — creates a real Shopify discount code via the existing `create-discount` route (called with `markdown: false`), reusing `createProductDiscountCode()` unchanged. Needs `write_discounts`, which per the Auth section above is not yet confirmed granted — may 403 until an OAuth reconnect; the raw error is surfaced rather than masked.

### Discounts tab + product-page Discount Banner (Products & Inventory)
A fourth "Discounts" tab (`DiscountsTab` in `ProductsInventory.tsx`) lists every **active** Shopify discount, code and automatic, via `GET /api/shopify/discounts` → `listActiveDiscounts()` in `src/lib/shopify-discount-list.ts`. That uses GraphQL `discountNodes(query: "status:active")` with pagination.
- **Columns:** code or "Automatic", details (`summary`), what it applies to, **times used** (`asyncUsageCount`, which Shopify updates asynchronously so it can lag), usage limit with a progress bar, total sales (code discounts only), and start/end dates. Summary stat cards sit on top.
- **Loading:** discounts load separately from the main product load (`loadDiscounts()`), so a missing `read_discounts` scope only breaks this tab and the banner buttons. The error is shown along with a reconnect hint.
- **Checked against docs, not live:** field names were checked per discount type against Shopify's docs, not against the live store, because the session only exists in the browser cookie. One exception: `DiscountAutomaticFreeShipping` may not exist in API version 2024-10, so the query includes it and retries without it if Shopify rejects that type.

**Discount Banner:** "Show discount banner" writes a `custom.discount_banner` **JSON** product metafield, `{ title, code, message, ends_at }`, via `PUT /api/shopify/products/[id]/discount-banner`. `DELETE` removes it. It follows the same metafieldsSet / best-effort definition pattern as Final Sale and Fit Note, and needs `write_products` plus `read_discounts`.
- **Validation:** the route re-reads the discount from Shopify rather than trusting the client, checks it's ACTIVE and applies to that product (`discountAppliesToProduct()`: "all products", or listed in its products/variants), and takes the real code, title and end date from it.
- **Storefront:** `theme-snippets/discount-banner.liquid` renders it (install once, like the other snippets). It shows the message, the discount name, and the code with a Copy button; automatic discounts say they apply at checkout. It hides itself after `ends_at`.
- **Local mirror:** `data/product-discount-banners.json` records which products have a banner, and is what the UI reads.
- **Where the button lives:** the shared `DiscountBannerControl` appears in the Spreadsheet's Actions column (for any product with an eligible active discount) and in the Discounts tab's expanded product list for product-scoped discounts.
- **Not supported yet:** collection-scoped, BXGY and free-shipping discounts are listed but never matched to a product banner.
- Creating a discount from the app refreshes the discount list.

### Inventory Age / Slow Movers (Products & Inventory)
An **Inventory Age** column in the Margin Spreadsheet shows days since the last detected restock, or since Date Added (`createdAt`) if no restock has been seen (`inventoryAgeDays()` in `src/lib/inventory-age.ts`). A product with stock on hand and age > 120 days (`SLOW_MOVER_DAYS`) is flagged **Possible slow mover**. A toolbar toggle filters to just those. Separate from "Stalled" (`STALLED_DAYS` = 90 days since last *sale*): this is about how long stock has sat, not how long since it sold.

**Restock detection:** Shopify's API has no inventory-adjustment history, so the app detects restocks itself. Every `/api/shopify/products` load calls `recordInventorySnapshots()` (`src/lib/inventory-snapshots-storage.ts`, `data/inventory-snapshots.json`), which records each real catalog product's total on-hand quantity. Products with a null id, i.e. demo data, are skipped. A rise of **≥ 2 units** (`RESTOCK_MIN_INCREASE`) between loads counts as a restock and resets the age. Single-unit rises are ignored because they're usually a returned item. The known limitations:
- Tracking only starts when a product is first seen, so restocks before that are unknown (`ProductSummary.restockTrackingSince`).
- Restocks are only seen when the dashboard is loaded.
- A sale and a restock between two loads can cancel out.

**Suggested discount** (`suggestSlowMoverDiscount()`):
- By age: 15% (120–179 days), 25% (180–269), 35% (270+).
- Capped at the product's discount floor (`maxDiscountForFloor()`, rounded down to a multiple of 5). If there's no room, it says so. With no cost known it suggests the tier % unchecked.
- "Apply" fills that row's Discount % draft; nothing is sent to Shopify until the usual Markdown or Create Discount.

### Discount Floor (Products & Inventory)
Every product has a minimum acceptable margin %, 10% by default (`DEFAULT_MARGIN_FLOOR_PCT` in `src/lib/margin-floor.ts`, client-safe). You can override it per product in the Margin Spreadsheet's **Min Margin** column; blank means the default. Overrides are saved to `data/product-margin-floors.json` via `GET`/`PUT /api/shopify/product-margin-floors` by the spreadsheet's existing Save button, together with the discount drafts. Entries equal to the default are dropped.

It's a **warning, never a block**. When a discount or markdown would push margin % below the floor (`isBelowFloor()`), warnings appear in:
- the Spreadsheet's Discount % input (red), its Margin at Discount cell, and its Markdown and Create Discount confirmations
- the Margin cell, if the current price is already under the floor (e.g. after a markdown)
- the Overview's Stalled Inventory panel (`StalledCampaignPanel`, via `ResolvedRow.marginFloor`): under the discount selector, on the Margin at Discount stat, and in the Create Discount confirmation

The Min Margin cell also shows the largest discount that stays at or above the floor (`maxDiscountForFloor()`: `1 − cost / (price·(1 − floor))`). The shared warning text comes from the `FloorWarning` component. No warning appears when cost is unknown, because margin can't be computed.

### Cost Breakdown (Products & Inventory)
A third "Cost Breakdown" tab (`CostBreakdownSheet` in `ProductsInventory.tsx`) with one hand-entered per-unit € input per product for each of Fabric, Beads, Garment, Printing, Painting, Canvas, Label, Hand work, Shipping and Shopify Monthly (the list is `BUILT_IN_COST_COMPONENTS` in `src/lib/cost-breakdown.ts`, which is client-safe and has no `fs`). **Total Cost** is always calculated (`breakdownTotal()`: every stored value summed, blanks = 0, `null` if nothing is filled) and never typed in.

**Column layout:** every column, built-in or custom, lives in one ordered list with editable titles (`data/cost-columns.json`, read with `readCostColumns()`). Until the layout is first changed, it falls back to `BUILT_IN_COST_COMPONENTS`. Any built-in missing from the stored file is appended when read, so adding a new built-in in code is safe.
- **Header controls:** each header has a Sheets-style ▾ menu with Rename, Move left/right, Insert column left/right, and Delete (custom columns only, after a confirm). Double-clicking a title also renames it, and headers can be dragged to reorder (native HTML5 drag and drop). "+ Add column" at the end appends a column.
- **Saving:** every layout change saves immediately through `/api/shopify/product-cost-breakdown/columns`: `POST {label, index?}` inserts, `PATCH {key, label}` renames, `PUT {order}` reorders and `DELETE {key}` deletes. Each returns the full `{ columns }`. Reordering updates the screen first and reverts if the save fails. Only cell values wait for Save.
- **Keys:** a column's `key` never changes. Renaming only changes `label`, so values are kept, and custom keys are opaque (`c_<hex>`).
- **Deleting** a custom column removes every product's value in it, from the saved file and unsaved edits. That's why `breakdownTotal()` can safely sum every stored key. The main `PUT` route rejects any key that isn't in the current layout.
- The fill handle's active cell is tracked by column key rather than position, so it stays on the right column after a move.
- `ProductsInventory` holds the layout and passes it to both tabs, since the Spreadsheet's Total Cost tooltip lists every part by its current title.

**Cost precedence:** if a product has any breakdown field filled in, its breakdown total becomes the product's cost everywhere (Margin, Margin at Discount, Cost Basis at Risk, the Stalled KPI, the CSV export). Otherwise the cost falls back to Shopify's Cost per item, then the manual cost (`product-cogs.json`). This lives in two resolvers that must stay in sync: `cogsForRow()` (module-level, used by the Spreadsheet) and `cogsFor()` (inside `ProductsInventory`).

**Linked tabs:** the Spreadsheet's column is labelled "Total Cost". When a product has a breakdown, that cell is a link whose tooltip lists the parts, and it also shows "Shopify: €X" if Shopify's Cost per item differs. Otherwise the cell shows the usual `CogsEditor` plus a "+ breakdown" link. Either link switches to Cost Breakdown and scrolls to and highlights that row. The icon next to each product name in Cost Breakdown jumps back. The sheet stays mounted (hidden) while you're on other tabs, so unsaved edits survive a round trip.

**Spreadsheet-style editing:** the last focused cost cell shows a fill handle, a small square in its corner. Dragging it copies that cell's value along one axis, whichever was dragged further, just like Google Sheets. Pasting a tab/newline block copied from Sheets or Excel spreads it across the grid, starting from the cell you paste into (`handlePaste()`). Pasted values are cleaned up by `sanitizePastedNumber()`, which strips currency symbols and treats a lone comma as a decimal separator. Both edit the unsaved local state only, so you still need to click Save.

### Data storage (JSON files — no DB)
| File | Owned by | Contents |
|---|---|---|
| `data/customer-manual-tags.json` | `src/lib/customer-tags-storage.ts` | `{ customerId: string[] }` |
| `data/customer-tag-types.json` | `src/lib/customer-tags-storage.ts` | `string[]` of custom tag names |
| `data/product-categories.json` | `src/lib/product-categories-storage.ts` | `{ "Product Title": "Category" }` |
| `data/product-fit-notes.json` | `src/lib/product-fit-notes-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.fit_note` metafield |
| `data/product-preorders.json` | `src/lib/product-preorders-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.preorder` metafield |
| `data/product-final-sale.json` | `src/lib/product-final-sale-storage.ts` | `{ productId: { text, status: 'draft'\|'published', updatedAt } }` — draft state + mirror of the published `custom.final_sale` metafield |
| `data/product-cost-breakdown.json` | `src/lib/product-cost-breakdown-storage.ts` | `{ productId: { fabric?, beads?, garment?, printing?, painting?, canvas?, label?, handWork?, shipping?, shopifyMonthly?, [customKey]? } }` — per-unit € cost components from the "Cost Breakdown" tab; their sum overrides Shopify's Cost per item |
| `data/cost-columns.json` | `src/lib/product-cost-breakdown-storage.ts` | `[{ key, label, custom? }]` — ordered Cost Breakdown column layout (built-in + custom), with editable titles; absent = built-in defaults |
| `data/product-margin-floors.json` | `src/lib/product-margin-floors-storage.ts` | `{ productId: minMarginPct }` — per-product discount-floor overrides (absent = 10% default), saved by the Margin Spreadsheet's Save button |
| `data/inventory-snapshots.json` | `src/lib/inventory-snapshots-storage.ts` | `{ productId: { qty, lastSeenAt, lastRestockedAt, trackingSince } }` — per-product stock snapshots written on every products load; a ≥2-unit rise = detected restock (feeds Inventory Age) |
| `data/product-discount-banners.json` | `src/lib/product-discount-banners-storage.ts` | `{ productId: { discountId, title, code, message, endsAt, publishedAt } }` — mirror of each product's live `custom.discount_banner` metafield |
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
