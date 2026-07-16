import { ExternalLink } from 'lucide-react'
import { LOYAL_MIN_ORDERS, VIP_MIN_ORDERS, AT_RISK_START_DAYS, LAPSED_START_DAYS, LOST_DAYS, ABANDONED_CHECKOUT_WINDOW_DAYS } from '@/lib/segmentation'

// Pulled from src/lib/segmentation.ts, the single real source of truth behind both
// the Customers tab and the Journey tab — this copy used to describe a different,
// unwired rule set (AOV-based VIP, email-open-based "Email Ghost") that never
// matched what the app actually computed. It's derived from the live constants now
// so it can't drift out of sync again.
const LOGIC_ITEMS = [
  {
    tag: 'VIP',
    color: 'bg-terracotta-100 text-terracotta-700',
    logic: `${VIP_MIN_ORDERS}+ orders, most recent within ${LOST_DAYS} days`,
    why: "Frequency, not spend, is the strongest repeat-purchase signal I have without a store-specific AOV benchmark to lean on. VIPs get a longer recency runway than everyone else before falling out of the tier — their buying cadence is naturally slower than a one-time shopper's.",
  },
  {
    tag: 'Loyal',
    color: 'bg-olive-100 text-olive-600',
    logic: `${LOYAL_MIN_ORDERS}–${VIP_MIN_ORDERS - 1} orders, active within ${AT_RISK_START_DAYS} days`,
    why: 'Repeat purchasers below the VIP bar are still your most profitable segment relative to acquisition cost. They deserve acknowledgment — a community invite, referral access, or an upgrade nudge toward VIP. (A separate "Active" tier catches 2-3 order customers who haven\'t reached Loyal yet.)',
  },
  {
    tag: 'At Risk / Winback',
    color: 'bg-amber-50 text-amber-700',
    logic: `${AT_RISK_START_DAYS}–${LAPSED_START_DAYS - 1} days since last order`,
    why: "Lifecycle marketing's highest-leverage window. One-time buyers get a distinct 'Winback' tag instead of 'At Risk' here — a customer with exactly one order needs a different message than a repeat buyer who's slowed down.",
  },
  {
    tag: 'Abandoned Checkout',
    color: 'bg-red-50 text-red-600',
    logic: `Open checkout within the last ${ABANDONED_CHECKOUT_WINDOW_DAYS} days`,
    why: "An independent flag, not a lifecycle stage — a VIP can show this too if they've got a live cart on something new. A checkout that's been sitting open for months isn't a hot lead anymore, so this expires instead of counting forever.",
  },
]

export default function AboutTool() {
  return (
    <section className="max-w-2xl">
      <h2 className="font-serif text-3xl text-charcoal-700 tracking-tight mb-3">About This Tool</h2>
      <p className="text-sm text-charcoal-400 mb-10">What it does, and why it's built this way</p>

      <div className="prose prose-sm max-w-none text-charcoal-500 leading-relaxed space-y-5 mb-12">
        <p>
          I built this dashboard because I got tired of toggling between Shopify's admin, Omnisend's reporting tab,
          and a spreadsheet every morning. The data I needed to act on was scattered — late orders buried in filters,
          email metrics that didn't surface revenue, customers I knew were slipping away but had no easy way to catch.
        </p>
        <p>
          This is the operational layer I actually wanted. It pulls live data from Shopify and Omnisend, surfaces what
          needs attention, and lets me write behavioral tags back to both platforms so my automations have context.
        </p>
        <p>
          The tagging logic reflects how I think about lifecycle marketing: not as blasts to "the list," but as
          conversations calibrated to where someone is in their relationship with the brand. Each tag maps to a
          distinct intervention — a different tone, a different offer, a different ask.
        </p>
        <p>
          It's also architected to grow. The API layer is clean enough to convert into a Shopify embedded app, and the
          tag sync writes directly to Shopify customer records and Omnisend contacts so any automation tool downstream
          can read them.
        </p>
      </div>

      {/* Tag logic breakdown */}
      <div className="mb-12">
        <h3 className="font-serif text-xl text-charcoal-700 mb-5">The Tagging Logic</h3>
        <div className="space-y-4">
          {LOGIC_ITEMS.map((item) => (
            <div key={item.tag} className="bg-white rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.color}`}>
                  {item.tag}
                </span>
                <span className="text-xs text-charcoal-400 font-mono">{item.logic}</span>
              </div>
              <p className="text-sm text-charcoal-500 leading-relaxed">{item.why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stack */}
      <div className="bg-sand-100 rounded-2xl p-6 mb-10">
        <h3 className="font-serif text-xl text-charcoal-700 mb-4">Stack</h3>
        <ul className="text-sm text-charcoal-500 space-y-2">
          <li><span className="font-medium text-charcoal-700">Next.js 14</span> — App Router, API routes, server-side auth</li>
          <li><span className="font-medium text-charcoal-700">Tailwind CSS</span> — custom earthy palette, no component library</li>
          <li><span className="font-medium text-charcoal-700">Shopify Admin API</span> — orders, customers, tag writes (REST, 2024-10)</li>
          <li><span className="font-medium text-charcoal-700">Omnisend API</span> — campaign stats, contact tag sync (v3)</li>
          <li><span className="font-medium text-charcoal-700">TypeScript</span> — typed throughout</li>
        </ul>
      </div>

      {/* Link out */}
      <a
        href="https://carladopazo.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-terracotta-600 hover:text-terracotta-700 transition-colors group"
      >
        More of my work at carladopazo.com
        <ExternalLink size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </a>
    </section>
  )
}
