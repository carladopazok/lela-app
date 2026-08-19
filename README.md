# Lela Dashboard

A personal ecommerce operations dashboard for [carladopazo.com](https://carladopazo.com), a Shopify store. Built with Next.js 14 (App Router), TypeScript, and Tailwind CSS.

## Features

- **Sales Overview** — revenue and order stats with a period selector (Today / 30d / 60d / 90d / 365d / All Time)
- **Late Shipments** — unfulfilled orders older than 3 days
- **Email Performance** — recent Omnisend campaign stats
- **Customer Intelligence** — customer list with automatic tagging (VIP, 1-order, never-purchased, winback), synced to Shopify and Omnisend
- **Customer Service** — Outlook inbox integration (via Microsoft Graph API) and Instagram DM integration (via Instagram Graph API), with tickets and reusable macros
- **Integrations** — connection-status check for Odoo (auth only, no data sync yet)
- **About This Tool** — overview page for the dashboard itself

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | Your `.myshopify.com` domain |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Shopify Partner app credentials |
| `SHOPIFY_ACCESS_TOKEN` | Optional — skips the Shopify OAuth flow if set |
| `APP_URL` | Base URL of the app (used for OAuth redirects) |
| `APP_SECRET` | Random 32-byte hex secret for encrypting the session cookie |
| `OMNISEND_API_KEY` | Omnisend API key for email performance data |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` | Azure app registration credentials for Microsoft Graph (Outlook integration) |
| `OUTLOOK_EMAIL` | Mailbox address used for the Customer Service inbox |
| `IG_APP_ID` / `IG_APP_SECRET` | Meta App credentials for the Instagram Graph API (Instagram DM integration) |
| `ODOO_URL` / `ODOO_DB` / `ODOO_USERNAME` / `ODOO_API_KEY` | Odoo instance credentials for the Integrations tab's connection-status check |

Shopify auth uses Partner app OAuth by default. Setting `SHOPIFY_ACCESS_TOKEN` skips the OAuth flow.

The Outlook integration for Customer Service requires a separate Azure app registration (Microsoft Graph API, `Mail.ReadWrite` / `Mail.Send` / `offline_access` scopes). `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and `MS_TENANT_ID` come from that registration.

The Instagram integration for Customer Service uses Meta's "Instagram API with Instagram Login" product — a standalone flow tied directly to an Instagram Professional (Business/Creator) account, with **no Facebook Page or Facebook Login involved**. `IG_APP_ID` and `IG_APP_SECRET` come from that product's own setup page in the Meta dashboard (shown as "Instagram App ID"/"Instagram App Secret" there — a different pair of values from the app's general Settings → Basic App ID, if the app has one). `{APP_URL}/api/instagram/auth/callback` must be registered as a redirect URI on that same Instagram API setup page, requesting the `instagram_business_basic` and `instagram_business_manage_messages` scopes. See `CLAUDE.md` for the exact endpoints, the sync model, and known limitations.

The Odoo integration on the Integrations tab is a connection check only — it authenticates against Odoo's JSON-RPC API (`authenticate` on the `common` service) and reports whether the credentials work. It does not sync or display any Odoo data yet.

Note: `.env.local.example` is currently missing the `SHOPIFY_ACCESS_TOKEN`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, and `OUTLOOK_EMAIL` entries — add them there too if you want the example file to stay a complete template. (`IG_APP_ID` / `IG_APP_SECRET` are already in the example file.)

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint the codebase
