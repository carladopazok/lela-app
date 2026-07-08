---
name: shopify-debug
description: Checklist for diagnosing Shopify API calls that return wrong data, 0 records, or silent errors
---

# Shopify API Debugging

Use this skill when a Shopify API call returns unexpected results — 0 orders, missing products, silent failures, or stale data.

## Checklist

### 1. Check OAuth scopes

The token may be missing a scope it needs. Required scopes for this app:
- `read_orders` — current orders
- `read_all_orders` — orders older than 60 days (without this, historical orders silently disappear)
- `read_customers`, `write_customers` — customer data and tag writes
- `read_products` — **NOT granted** — any call to `/products.json` will 403

Hit `/api/debug/shopify` to see the current session's shop domain and token status.

### 2. Scope failure pattern — wrap secondary fetches

When a primary fetch (orders, customers) needs a secondary fetch (product images), a scope error on the secondary must NOT kill the parent:

```typescript
// Primary fetch succeeds
const orders = await shopify.getAll(...)

// Secondary fetch may 403 — wrap it
try {
  const products = await shopify.get('/products.json', { ids: '...' })
  // populate map
} catch {
  // read_products not granted — continue without images
}

return NextResponse.json({ orders }) // always returns
```

Never let a product/image fetch throw up to the route handler — it will turn a partial success into a 500.

### 3. Historical orders missing

If orders count looks too low, check `created_at_min`:
- `yearAgo` filter in `/api/shopify/customers/route.ts` only looks back 365 days for tag computation
- `/api/shopify/customers/[id]/orders/route.ts` uses `created_at_min: '2020-01-01'` to fetch all history
- Without `read_all_orders` scope, Shopify silently omits orders older than 60 days regardless of the date param

### 4. HMR silent failure (most common cause of "nothing changed")

After editing multiple files simultaneously, Next.js HMR can silently stop propagating updates. The page looks stale even though the code is correct.

```bash
pkill -f "next dev"
pkill -f "next-server"
npm run dev
```

Then **Cmd+Shift+R** in the browser to hard-refresh.

### 5. API response shape mismatch

The frontend may be reading the wrong key from a JSON response. Check the API route returns `{ orders: [...] }` not just `[...]` — the frontend destructures these by name:

```typescript
// route.ts
return NextResponse.json({ orders: enriched, shop: session.shop })

// component
const { orders, shop } = await res.json()
```

### 6. Shopify rate limiting

Shopify's REST API allows 2 req/s (burst 40). `shopify.getAll()` paginates with 250-item pages. If a customer list fetch times out or returns partial data, add a small delay between pages or reduce page size.

### 7. Date/timezone issues

Shopify returns dates in UTC ISO format. Comparisons that use `new Date()` locally should be fine, but `created_at_min` params must be ISO strings: `new Date(Date.now() - 365 * 86_400_000).toISOString()`.
