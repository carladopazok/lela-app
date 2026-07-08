const PREDEFINED: Record<string, { label: string; classes: string }> = {
  VIP:              { label: 'VIP',             classes: 'bg-terracotta-100 text-terracotta-700 border border-terracotta-200' },
  '1-order':        { label: '1 Order',         classes: 'bg-olive-100 text-olive-600 border border-olive-200' },
  'never-purchased':{ label: 'Never Purchased', classes: 'bg-sand-100 text-charcoal-500 border border-sand-300' },
  winback:          { label: 'Winback',         classes: 'bg-amber-50 text-amber-700 border border-amber-200' },
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
