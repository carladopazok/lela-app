---
name: add-section
description: Step-by-step guide for adding a new section/page to the Lela dashboard
---

# Add a New Dashboard Section

Use this skill when the user asks to add a new section, page, or feature area to the dashboard.

## Steps

### 1. Create the section component

Create `src/components/sections/YourSection.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function YourSection() {
  const [data, setData] = useState<YourType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/your-route')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  return (
    <section className="max-w-4xl">
      <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight mb-6">Section Title</h2>
      {loading && <LoadingSpinner label="Loading…" />}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {data && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          {/* content */}
        </div>
      )}
    </section>
  )
}
```

Design rules:
- Use only palette tokens: `terracotta`, `olive`, `cream`, `sand`, `charcoal` (see CLAUDE.md)
- Cards: `bg-white rounded-2xl shadow-card p-5`
- Section headers (inside cards): `text-xs font-semibold uppercase tracking-widest text-charcoal-400`
- Body text: `text-sm text-charcoal-700`; muted: `text-xs text-charcoal-400`

### 2. Create the API route

Create `src/app/api/your-area/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createShopifyClient } from '@/lib/shopify'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const shopify = createShopifyClient(session)
    // ... fetch data
    return NextResponse.json({ /* data */ })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

For paginated Shopify data use `shopify.getAll<Type>('/endpoint.json', 'key', { params })`.  
Always wrap secondary fetches (products, images) in a nested try/catch — `read_products` scope may not be granted.

### 3. Register in the sidebar

In `src/components/layout/Sidebar.tsx`, add a nav item to the existing array:
```typescript
{ id: 'your-section', label: 'Your Section', icon: SomeIcon }
```

### 4. Render in the main page

In `src/app/page.tsx`:
1. Import the component: `import YourSection from '@/components/sections/YourSection'`
2. Add a case to the section switcher: `{activeSection === 'your-section' && <YourSection />}`

### 5. Add types

Add any new interfaces to `src/types/index.ts`. Extend existing types (`EnrichedCustomer`, `ShopifyOrder`) rather than duplicating fields.

## After making changes

If UI doesn't update after editing multiple files, HMR may have silently failed:
```bash
pkill -f "next dev"
npm run dev
```
Then hard-refresh the browser (Cmd+Shift+R).
