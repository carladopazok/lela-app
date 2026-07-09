import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import type { DailyRevenue, CampaignFlowRevenue, ForecastMeta, CustomerOrderRow } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DAILY_REVENUE_FILE = path.join(DATA_DIR, 'daily-revenue.json')
const CAMPAIGN_FLOW_REVENUE_FILE = path.join(DATA_DIR, 'campaign-flow-revenue.json')
const FORECAST_META_FILE = path.join(DATA_DIR, 'forecast-meta.json')
const CUSTOMER_ORDERS_FILE = path.join(DATA_DIR, 'customer-orders.json')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readDailyRevenue(): DailyRevenue[] {
  try {
    if (!existsSync(DAILY_REVENUE_FILE)) return []
    return JSON.parse(readFileSync(DAILY_REVENUE_FILE, 'utf-8')) as DailyRevenue[]
  } catch {
    return []
  }
}

export function writeDailyRevenue(rows: DailyRevenue[]) {
  ensureDataDir()
  writeFileSync(DAILY_REVENUE_FILE, JSON.stringify(rows, null, 2))
}

export function readCampaignFlowRevenue(): CampaignFlowRevenue[] {
  try {
    if (!existsSync(CAMPAIGN_FLOW_REVENUE_FILE)) return []
    return JSON.parse(readFileSync(CAMPAIGN_FLOW_REVENUE_FILE, 'utf-8')) as CampaignFlowRevenue[]
  } catch {
    return []
  }
}

export function writeCampaignFlowRevenue(rows: CampaignFlowRevenue[]) {
  ensureDataDir()
  writeFileSync(CAMPAIGN_FLOW_REVENUE_FILE, JSON.stringify(rows, null, 2))
}

export function readForecastMeta(): ForecastMeta {
  try {
    if (!existsSync(FORECAST_META_FILE)) {
      return { lastBackfillAt: null, lastRefreshAt: null, omnisendAttributionAvailable: false }
    }
    return JSON.parse(readFileSync(FORECAST_META_FILE, 'utf-8')) as ForecastMeta
  } catch {
    return { lastBackfillAt: null, lastRefreshAt: null, omnisendAttributionAvailable: false }
  }
}

export function writeForecastMeta(meta: ForecastMeta) {
  ensureDataDir()
  writeFileSync(FORECAST_META_FILE, JSON.stringify(meta, null, 2))
}

export function readCustomerOrders(): CustomerOrderRow[] {
  try {
    if (!existsSync(CUSTOMER_ORDERS_FILE)) return []
    return JSON.parse(readFileSync(CUSTOMER_ORDERS_FILE, 'utf-8')) as CustomerOrderRow[]
  } catch {
    return []
  }
}

export function writeCustomerOrders(rows: CustomerOrderRow[]) {
  ensureDataDir()
  writeFileSync(CUSTOMER_ORDERS_FILE, JSON.stringify(rows, null, 2))
}
