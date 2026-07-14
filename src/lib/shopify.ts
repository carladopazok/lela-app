const VERSION = '2024-10'

interface ShopifyAuth {
  accessToken: string
  shop: string
}

function buildHeaders(token: string) {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  }
}

/**
 * Returns a typed Shopify Admin API client bound to the given shop + accessToken.
 * Pass the session object directly: createShopifyClient(session)
 */
export function createShopifyClient({ accessToken, shop }: ShopifyAuth) {
  const base = `https://${shop}/admin/api/${VERSION}`
  const token = accessToken

  async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${base}${path}`)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), { headers: buildHeaders(token), cache: 'no-store' })
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    return res.json()
  }

  async function put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    return res.json()
  }

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}/graphql.json`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    const json = await res.json()
    if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`)
    return json.data
  }

  async function getAll<T>(path: string, key: string, params: Record<string, string> = {}): Promise<T[]> {
    const results: T[] = []
    const initialUrl = new URL(`${base}${path}`)
    initialUrl.searchParams.set('limit', '250')
    Object.entries(params).forEach(([k, v]) => initialUrl.searchParams.set(k, v))

    let pageUrl: string | null = initialUrl.toString()

    while (pageUrl !== null) {
      const url: string = pageUrl
      pageUrl = null

      const res: Response = await fetch(url, { headers: buildHeaders(token), cache: 'no-store' })
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)

      const data: Record<string, T[]> = await res.json()
      results.push(...data[key])

      const link: string | null = res.headers.get('Link')
      if (link) {
        const m: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/)
        if (m) pageUrl = m[1]
      }
    }

    return results
  }

  return { get, put, getAll, graphql }
}
