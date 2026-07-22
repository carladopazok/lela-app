const SPAM_DOMAINS = new Set([
  'klaviyo.com', 'hello.klaviyo.com', 'news.omnisend.com', 'omnisend.com',
  'clickup.com', 'help.clickup.com', 'accredible.com', 'orderlyemails.com',
])

const SPAM_LOCAL_PART_PATTERNS = [
  'no-reply', 'noreply', 'notifications', 'notification',
  'news', 'newsletter', 'updates', 'do-not-reply', 'donotreply',
]

export function isLikelySpamSender(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at === -1) return false
  const domain = trimmed.slice(at + 1)
  const localPart = trimmed.slice(0, at)
  if (SPAM_DOMAINS.has(domain)) return true
  return SPAM_LOCAL_PART_PATTERNS.some((p) => localPart.includes(p))
}
