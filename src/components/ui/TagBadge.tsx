const PREDEFINED: Record<string, { label: string; classes: string }> = {
  VIP:              { label: 'VIP',             classes: 'bg-green-50 text-green-700 border border-green-200' },
  '1-order':        { label: '1 Order',         classes: 'bg-charcoal-900 text-white border border-charcoal-900' },
  loyal:            { label: 'Loyal',           classes: 'bg-teal-50 text-teal-700 border border-teal-200' },
  active:           { label: 'Active',          classes: 'bg-blue-50 text-blue-700 border border-blue-200' },
  'never-purchased':{ label: 'Lead',             classes: 'bg-sand-100 text-charcoal-500 border border-sand-300' },
  winback:          { label: 'Winback',         classes: 'bg-orange-50 text-orange-700 border border-orange-200' },
  'at-risk':        { label: 'At Risk',         classes: 'bg-amber-50 text-amber-700 border border-amber-200' },
  lapsed:           { label: 'Lapsed',          classes: 'bg-red-50 text-red-600 border border-red-200' },
  lost:             { label: 'Lost',            classes: 'bg-sand-200 text-charcoal-700 border border-charcoal-400' },
  'abandoned-checkout': { label: 'Abandoned Checkout', classes: 'bg-red-50 text-red-600 border border-red-200' },
}

const CUSTOM_CLASSES = 'bg-violet-50 text-violet-700 border border-violet-200'

// Shared with Segments.tsx, so a tag's friendly name (e.g. 'never-purchased' →
// 'Lead') reads the same wherever it's shown, not just inside the badge itself.
export function tagLabel(tag: string): string {
  return PREDEFINED[tag]?.label ?? tag
}

export default function TagBadge({ tag }: { tag: string }) {
  const config = PREDEFINED[tag]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${config ? config.classes : CUSTOM_CLASSES}`}>
      {config ? config.label : tag}
    </span>
  )
}
