import * as xrpl from 'xrpl'

export function displayCurrency(code) {
  if (!code || code === 'XRP') return 'XRP'
  if (typeof code === 'string' && code.length === 40 && /^[0-9A-Fa-f]+$/.test(code)) {
    try {
      const text = xrpl.convertHexToString(code).replace(/\0/g, '').trim()
      if (text) return text
    } catch { /* keep the raw code */ }
  }
  return code
}

export function shortIssuer(issuer) {
  if (!issuer || issuer.length < 12) return issuer || ''
  return `${issuer.slice(0, 4)}…${issuer.slice(-4)}`
}

export function holdingsFromLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines
    .filter(line => line && line.currency && line.balance != null)
    .map(line => ({
      currency: displayCurrency(line.currency),
      code: line.currency,
      issuer: line.account || line.issuer || '',
      balance: String(line.balance),
      limit: line.limit != null ? String(line.limit) : '',
    }))
}

export function formatBalanceChange(balance) {
  const n = Number(balance.value)
  const sign = n > 0 ? '+' : ''
  const cur = displayCurrency(balance.currency)
  if (!balance.issuer || cur === 'XRP') return `${sign}${balance.value} ${cur}`
  return `${sign}${balance.value} ${cur} · ${shortIssuer(balance.issuer)}`
}

export function formatAmount(amt) {
  if (amt == null) return null
  if (typeof amt === 'string') {
    try { return `${xrpl.dropsToXrp(amt)} XRP` } catch { return `${amt} drops` }
  }
  if (amt.mpt_issuance_id) return `${amt.value} MPT ${String(amt.mpt_issuance_id).slice(0, 8)}…`
  if (amt.value && amt.currency) {
    const cur = displayCurrency(amt.currency)
    const who = amt.issuer ? ` · ${shortIssuer(amt.issuer)}` : ''
    return `${amt.value} ${cur}${who}`
  }
  return null
}
