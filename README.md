# Lela Dashboard

A personal ecommerce operations dashboard for [carladopazo.com](https://carladopazo.com), a Shopify store. Built with Next.js 14 (App Router), TypeScript, and Tailwind CSS.

## Features

- **Sales Overview** — revenue and order stats with a period selector (Today / 30d / 60d / 90d / 365d / All Time)
- **Late Shipments** — unfulfilled orders older than 3 days
- **Email Performance** — recent Omnisend campaign stats
- **Customer Intelligence** — customer list with automatic tagging (VIP, 1-order, never-purchased, winback), synced to Shopify and Omnisend
- **Customer Service** — Outlook inbox integration (via Microsoft Graph API) with tickets and reusable macros
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
| `APP_URL` | Base URL of the app (used for OAuth redirects) |
| `APP_SECRET` | Random 32-byte hex secret for encrypting the session cookie |
| `OMNISEND_API_KEY` | Omnisend API key for email performance data |

Shopify auth uses Partner app OAuth by default. Setting `SHOPIFY_ACCESS_TOKEN` skips the OAuth flow.

The Outlook integration for Customer Service requires a separate Azure app registration (Microsoft Graph API, `Mail.ReadWrite` / `Mail.Send` / `offline_access` scopes).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint the codebase
