const PREDEFINED: Record<string, { label: string; classes: string }> = {
  VIP:              { label: 'VIP',             classes: 'bg-green-50 text-green-700 border border-green-200' },
  '1-order':        { label: '1 Order',         classes: 'bg-charcoal-900 text-white border border-charcoal-900' },
  'never-purchased':{ label: 'Never Purchased', classes: 'bg-sand-100 text-charcoal-500 border border-sand-300' },
  winback:          { label: 'Winback',         classes: 'bg-orange-50 text-orange-700 border border-orange-200' },
  'abandoned-checkout': { label: 'Abandoned Checkout', classes: 'bg-red-50 text-red-600 border border-red-200' },
}

const CUSTOM_CLASSES = 'bg-violet-50 text-violet-700 border border-violet-200'

export default function TagBadge({ tag }: { tag: string }) {
  const config = PREDEFINED[tag]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${config ? config.classes : CUSTOM_CLASSES}`}>
      {config ? config.label : tag}
    </span>
  )
}
