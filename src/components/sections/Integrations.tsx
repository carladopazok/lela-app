'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Plug, RefreshCw, ShoppingBag, Mail, Instagram } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type ConnectionStatus = { connected: true; detail?: string } | { connected: false; error: string }

interface IntegrationDef {
  key: string
  name: string
  Icon: React.ElementType
  statusUrl: string
  connectedNote: string
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'shopify',
    name: 'Shopify',
    Icon: ShoppingBag,
    statusUrl: '/api/shopify/status',
    connectedNote: 'Powers every section of this dashboard.',
  },
  {
    key: 'omnisend',
    name: 'Omnisend',
    Icon: Mail,
    statusUrl: '/api/omnisend/status',
    connectedNote: 'Powers Email Performance and customer sync.',
  },
  {
    key: 'odoo',
    name: 'Odoo',
    Icon: Plug,
    statusUrl: '/api/odoo/status',
    connectedNote: 'No data synced yet — coming soon.',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    Icon: Instagram,
    statusUrl: '/api/instagram/status',
    connectedNote: 'Powers the Instagram tab in Customer Service.',
  },
]

export default function Integrations() {
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus | null>>({})
  const [checking, setChecking] = useState<Record<string, boolean>>({})
  const [checkedAt, setCheckedAt] = useState<Record<string, Date>>({})

  const checkOne = useCallback(async (integration: IntegrationDef) => {
    setChecking((c) => ({ ...c, [integration.key]: true }))
    try {
      const res = await fetch(integration.statusUrl)
      const data = await res.json()
      setStatuses((s) => ({
        ...s,
        [integration.key]: res.ok
          ? (data as ConnectionStatus)
          : { connected: false, error: data.error ?? `Status check failed (${res.status})` },
      }))
    } catch (e) {
      setStatuses((s) => ({
        ...s,
        [integration.key]: { connected: false, error: e instanceof Error ? e.message : 'Failed to reach the status endpoint' },
      }))
    } finally {
      setCheckedAt((c) => ({ ...c, [integration.key]: new Date() }))
      setChecking((c) => ({ ...c, [integration.key]: false }))
    }
  }, [])

  useEffect(() => {
    INTEGRATIONS.forEach(checkOne)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stillLoading = INTEGRATIONS.some((i) => statuses[i.key] === undefined)

  return (
    <section className="max-w-2xl">
      <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight mb-1">Integrations</h2>
      <p className="text-sm text-charcoal-400 mb-8">
        Connection status for external systems used by or being evaluated for Lela.
      </p>

      {stillLoading ? (
        <LoadingSpinner label="Checking connections…" />
      ) : (
        <div className="flex flex-col gap-4">
          {INTEGRATIONS.map((integration) => {
            const status = statuses[integration.key]
            const isChecking = checking[integration.key]
            const lastChecked = checkedAt[integration.key]

            return (
              <div key={integration.key} className="bg-white rounded-2xl shadow-card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <integration.Icon size={18} className="text-charcoal-400" strokeWidth={1.8} />
                    <h3 className="font-medium text-charcoal-700">{integration.name}</h3>
                  </div>
                  <button
                    onClick={() => checkOne(integration)}
                    disabled={isChecking}
                    className="flex items-center gap-1.5 text-xs text-charcoal-400 hover:text-terracotta-500 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
                    {isChecking ? 'Checking…' : 'Recheck'}
                  </button>
                </div>

                {status && (
                  <>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        status.connected
                          ? 'bg-olive-100 text-olive-600 border-olive-200'
                          : 'bg-terracotta-100 text-terracotta-700 border-terracotta-200'
                      }`}
                    >
                      {status.connected ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {integration.name}: {status.connected ? 'Connected' : 'Not connected'}
                    </span>

                    {status.connected ? (
                      <p className="text-sm text-charcoal-500 mt-3">{integration.connectedNote}</p>
                    ) : (
                      <div className="mt-3 bg-sand-100 border border-terracotta-200 rounded-lg p-3">
                        <p className="text-xs font-mono text-terracotta-700 leading-relaxed break-words">{status.error}</p>
                      </div>
                    )}

                    {lastChecked && (
                      <p className="text-[11px] text-charcoal-400 mt-3">
                        Last checked {lastChecked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
