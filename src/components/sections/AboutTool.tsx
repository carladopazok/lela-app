import { ExternalLink } from 'lucide-react'

const LOGIC_ITEMS = [
  {
    tag: 'VIP',
    color: 'bg-terracotta-100 text-terracotta-700',
    logic: 'Average order value over $150',
    why: "High-AOV customers signal product affinity and purchase confidence. They're candidates for early access, loyalty perks, and upsell sequences — not discount campaigns.",
  },
  {
    tag: 'Loyalist',
    color: 'bg-olive-100 text-olive-600',
    logic: '3 or more orders placed',
    why: 'Repeat purchasers are your most profitable segment. They deserve acknowledgment — a personal thank-you flow, referral program access, or product feedback asks.',
  },
  {
    tag: 'At Risk',
    color: 'bg-amber-50 text-amber-700',
    logic: 'No purchase in the past 90 days',
    why: "Lifecycle marketing's highest-leverage opportunity. A win-back sequence (social proof, new arrivals, time-sensitive offer) sent at 90 days out-converts cold acquisition by 3–5x in my experience.",
  },
  {
    tag: 'Email Ghost',
    color: 'bg-sand-100 text-charcoal-500',
    logic: 'No email opens in 60 days',
    why: "Deliverability depends on list hygiene. Ghosts need a re-permission flow or suppression — not more sends. Keeping them active tanks open rates and eventually inbox placement.",
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
