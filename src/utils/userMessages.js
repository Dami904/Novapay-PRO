const FRIENDLY_MESSAGES = [
  {
    match: ['ACTION_REJECTED', '4001', 'user rejected', 'rejected'],
    message: 'You canceled the request in your wallet.',
  },
  {
    match: ['not installed', 'no injected provider', 'missing provider'],
    message: 'Please install a wallet app to continue.',
  },
  {
    match: ['switch', 'network', 'chain'],
    message: 'Please switch to the Morph Hoodi network and try again.',
  },
  {
    match: ['insufficient funds', 'insufficient balance'],
    message: "You don't have enough balance for this payout.",
  },
  {
    match: ['contract not deployed', 'demo mode'],
    message: "This feature isn't ready yet. Try Demo mode to explore the app.",
  },
  {
    match: ['csv parse error', 'excel parse error', 'failed to read file'],
    message: 'We could not read that file. Please upload a CSV or Excel file.',
  },
]

function toText(error) {
  if (!error) return ''
  if (typeof error === 'string') return error

  const parts = [
    error.message,
    error.shortMessage,
    error.reason,
    error.info?.error?.message,
    error.info?.message,
    error.data?.message,
  ]

  return parts.filter(Boolean).join(' ').trim()
}

export function getFriendlyErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const text = toText(error)
  if (!text) return fallback

  const lower = text.toLowerCase()

  for (const item of FRIENDLY_MESSAGES) {
    if (item.match.some((pattern) => lower.includes(pattern.toLowerCase()))) {
      return item.message
    }
  }

  if (!/(code|reason=|action=|params=|eth_|wallet_|json-rpc|rpc|revert|exception|transaction failed|stack trace|provider|signature|contract)/i.test(text)) {
    return text
  }

  return fallback
}
