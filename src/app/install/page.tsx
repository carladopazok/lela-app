export default function InstallPage() {
  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        {/* Wordmark */}
        <h1 className="font-serif text-5xl text-charcoal-700 tracking-tight mb-2">Lela</h1>
        <p className="text-sm text-charcoal-400 font-sans mb-10 leading-relaxed">
          Personal ecommerce operations dashboard — lifecycle marketing, made operational.
        </p>

        <div className="bg-white rounded-2xl shadow-card p-7 mb-6">
          <p className="text-sm text-charcoal-500 leading-relaxed mb-6">
            To get started, connect this app to your Shopify store. You&apos;ll be taken to Shopify
            to authorize access, then redirected back here.
          </p>

          <a
            href="/api/auth"
            className="flex items-center justify-center w-full py-3 px-6 rounded-xl bg-olive-700 hover:bg-olive-800 text-white text-sm font-medium transition-colors"
          >
            Connect to Shopify
          </a>
        </div>

        <div className="bg-sand-100 rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-400 mb-3">
            Required access
          </p>
          <ul className="text-xs text-charcoal-500 space-y-1.5">
            <li>• <span className="font-medium">read_orders</span> — late shipments &amp; sales overview</li>
            <li>• <span className="font-medium">read_customers</span> — customer intelligence</li>
            <li>• <span className="font-medium">write_customers</span> — sync behavioral tags back to Shopify</li>
            <li>• <span className="font-medium">read_returns</span> — product health / return-rate flagging</li>
          </ul>
        </div>

        <p className="text-xs text-charcoal-400 mt-8 text-center">
          carladopazo.myshopify.com
        </p>
      </div>
    </div>
  )
}
