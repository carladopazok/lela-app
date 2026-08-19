import { ExternalLink } from 'lucide-react'

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
          This is the operational layer I actually wanted. It pulls live data from Shopify and Omnisend — no cached
          snapshots — and surfaces what needs attention: late orders, revenue-blind email performance, customers
          showing early signs of churn.
        </p>
        <p>
          It also writes behavioral tags back to both platforms, so the context lives where your automations can
          actually use it. You'll see those tags reflected in your Shopify customer records and Omnisend contacts,
          not buried in a separate system.
        </p>
        <p>
          This is v1, built around my own workflow. The API layer is clean enough to extend — connecting with tools
          like Gorgias, Loop, and others merchants already rely on for operations is the direction I'm exploring next.
        </p>
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
